import Requirement from "../schemas/requirement.schema.js";
import productSchema from "../schemas/product.schema.js";
import multiProductSchema from "../schemas/multiProduct.schema.js";
import { ApiResponse } from "../helper/ApiReponse.js";
import mongoose from "mongoose";
import requirementSchema from "../schemas/requirement.schema.js";
import ApprovedRequirement from "../schemas/approvedRequirement.schema.js";
import ClosedDeal from "../schemas/closedDeal.schema.js";
import productNotificationSchema from "../schemas/productNotification.schema.js";
import userSchema from "../schemas/user.schema.js";

// Create a requirement (when a seller bids on a product)
export const createRequirement = async (req, res) => {
  try {
    const { productId, sellerId, buyerId, budgetAmount } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId) || !mongoose.Types.ObjectId.isValid(sellerId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid productId or sellerId");
    }
    if (!buyerId || !mongoose.Types.ObjectId.isValid(buyerId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid buyerId");
    }
    if (typeof budgetAmount !== "number" || isNaN(budgetAmount)) {
      return ApiResponse.errorResponse(res, 400, "Invalid budgetAmount");
    }

    // check product exists
    const product = await productSchema.findById(productId);
    if (!product) {
      return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    // check if requirement for this product & buyer exists
    let requirement = await requirementSchema.findOne({ productId, buyerId });

    if (requirement) {
      // check if seller already exists in sellers array
      const existingSeller = requirement.sellers.find(
        (s) => s.sellerId.toString() === sellerId
      );

      if (existingSeller) {
        // update budgetAmount if seller already exists
        existingSeller.budgetAmount = budgetAmount;
      } else {
        // add new seller entry
        requirement.sellers.push({ sellerId, budgetAmount });
      }

      await requirement.save();
      return ApiResponse.successResponse(res, 200, "Requirement updated successfully", requirement);
    } else {
      // create new requirement with sellers array
      requirement = new requirementSchema({
        productId,
        buyerId,
        sellers: [{ sellerId, budgetAmount }]
      });

      await requirement.save();
      return ApiResponse.successResponse(res, 201, "Requirement created successfully", requirement);
    }
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to create requirement");
  }
};

// Get all requirements for the current buyer
export const getBuyerRequirements = async (req, res) => {
  try {
    const buyerId = req.user?.userId;
    if (!buyerId) {
      return ApiResponse.errorResponse(res, 400, "Buyer not authenticated");
    }

    // ✅ Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch requirements with populated product + sellers
    const requirements = await Requirement.find({ buyerId ,isDelete:false})
      .populate({
        path: "productId",
        populate: { path: "categoryId", select: "-subCategories" },
      })
      .populate("buyerId")
      .populate({
        path: "sellers.sellerId",
        select: "-password -__v", // exclude sensitive fields
      })
      .sort({ createdAt: -1 }) // newest first
      .lean();

    // Helper to clean product data
    const cleanProduct = (prod) => {
      if (!prod) return prod;
      const p = { ...prod };

      if (p.userId?._id) p.userId = p.userId._id.toString();
      if (p.subCategoryId?._id) p.subCategoryId = p.subCategoryId._id;

      delete p.__v;
      return p;
    };

    // Manual date formatter
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Process and enhance requirements
    const enhancedRequirements = await Promise.all(
      requirements.map(async (requirement) => {
        const responseObj = {
          _id: requirement._id,
          status: requirement.status,
          createdAt: requirement.createdAt,
          updatedAt: requirement.updatedAt,
          product: requirement.productId,
          buyer: requirement.buyerId,
          sellers:
            requirement.sellers?.map((s) => ({
              seller: s.sellerId,
              budgetAmount: s.budgetAmount,
              date: formatDate(s.createdAt || requirement.createdAt),
            })) || [],
        };

        if (!responseObj.product?._id) {
          responseObj.product = null;
          return responseObj;
        }

        // Fetch related multiProduct info
        const multiProduct = await multiProductSchema
          .findOne({
            $or: [
              { mainProductId: responseObj.product._id },
              { subProducts: responseObj.product._id },
            ],
          })
          .populate({
            path: "mainProductId",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .populate({
            path: "subProducts",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .lean();

        if (multiProduct?.mainProductId) {
          const mainIdStr = multiProduct.mainProductId._id.toString();
          const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);

          const subProductsOnly = (multiProduct.subProducts || [])
            .filter((sub) => sub._id.toString() !== mainIdStr)
            .map(cleanProduct);

          responseObj.product = {
            ...cleanedMainProduct,
            subProducts: subProductsOnly,
          };
        } else {
          responseObj.product = {
            ...cleanProduct(responseObj.product),
            subProducts: [],
          };
        }

        return responseObj;
      })
    );

    // Remove duplicate product requirements
    const seenProductIds = new Set();
    let allRequirements = enhancedRequirements.filter((req) => {
      const prodId = req.product && req.product._id ? req.product._id.toString() : null;
      if (!prodId) return true;
      if (seenProductIds.has(prodId)) return false;
      seenProductIds.add(prodId);
      return true;
    });

    // ✅ Apply pagination
    const total = allRequirements.length;
    const paginatedData = allRequirements.slice(skip, skip + limit);

    return ApiResponse.successResponse(
      res,
      200,
      "Buyer requirements fetched successfully",
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: paginatedData,
      }
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Failed to fetch buyer requirements"
    );
  }
};

// Get all bid notifications for buyer from productNotificationSchema
export const getBuyerBidNotifications = async (req, res) => {
  try {
    const buyerId = req.user?.userId;
    if (!buyerId) {
      return ApiResponse.errorResponse(res, 400, "Buyer not authenticated");
    }

    // Fetch all notifications for this buyer from the database
    // Use aggregate to handle cases where productId might not exist
    const notifications = await productNotificationSchema.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(buyerId) }
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productId"
        }
      },
      {
        $unwind: {
          path: "$productId",
          preserveNullAndEmptyArrays: true  // Keep notifications even if product doesn't exist
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    return ApiResponse.successResponse(
      res,
      200,
      "Buyer bid notifications fetched successfully",
      notifications
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Failed to fetch buyer bid notifications"
    );
  }
};
export const getRecentRequirements = async(req,res)=>{
  try {
    //  requirements = await requirementSchema.find().sort({ createdAt: -1 }).limit(3).populate([
    //   {path:'productId',select:'title quantity image',populate:{path:"categoryId",select:"categoryName"}},
    //   {path:'buyerId',select:"firstName lastName currentLocation"},
    // ]).select('createdAt').lean();
    let requirements = await requirementSchema.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "productId"
        }
      },
      {$unwind:'$productId'},
      {
        $lookup:{
          from:"categories",
          let:{categoryId:"$productId.categoryId"},
          pipeline:[
            {
              $match:{
                $expr:{
                  $eq:["$_id","$$categoryId"]
                }
              }
            }
          ],
          as:"productId.categoryId"
        }
      },
      {$unwind:"$productId.categoryId"},
      {
        $lookup: {
          from: "users",
          localField: "buyerId",
          foreignField: "_id",
          as: "buyerId"
        }
      },
      {$unwind:'$buyerId'},
      {$sort:{createdAt:-1}},
      {$limit:3},
    ])

    return ApiResponse.successResponse(res, 200, "Requirements fetched successfully", requirements);
  } catch (error) {
    console.log(error)
    return ApiResponse.errorResponse(res, 400, "Something went wrong while getting requirements");
    
  }
}


// Get all requirements with dealStatus "completed", requirementApproved true, isDelete false, and buyerId = logged-in user
export const getCompletedApprovedRequirements = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }

    // Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch closed deals where user is either buyer OR seller
    const closedDeals = await ClosedDeal.find({
      $or: [
        { sellerId: userId },
        { buyerId: userId }
      ]
    })
      .populate({
        path: "productId",
        populate: { path: "categoryId", select: "-subCategories" }
      })
      .populate("buyerId")
      .populate({
        path: "sellerId",
        select: "-password -__v"
      })
      .lean();

    // Helper to clean product data
    const cleanProduct = (prod) => {
      if (!prod) return prod;
      const p = { ...prod };
      if (p.userId?._id) p.userId = p.userId._id.toString();
      if (p.subCategoryId?._id) p.subCategoryId = p.subCategoryId._id;
      delete p.__v;
      return p;
    };

    // For each closed deal, check if product is part of a multiProduct
    const enhancedDeals = await Promise.all(
      closedDeals.map(async (deal) => {
        const responseObj = {
          _id: deal._id,
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          product: deal.productId,
          buyer: deal.buyerId,
          seller: deal.sellerId,
          budgetAmount: deal.budgetAmount,
          date: deal.date,
          finalBudget: deal.finalBudget || 0,
          closedAt: deal.closedAt,
        };

        if (!responseObj.product?._id) {
          responseObj.product = null;
          return responseObj;
        }

        // Find multiProduct containing this product
        const multiProduct = await multiProductSchema
          .findOne({
            $or: [
              { mainProductId: responseObj.product._id },
              { subProducts: responseObj.product._id },
            ],
          })
          .populate({
            path: "mainProductId",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .populate({
            path: "subProducts",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .lean();

        if (multiProduct?.mainProductId) {
          const mainIdStr = multiProduct.mainProductId._id.toString();
          const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);

          // Filter & clean subProducts (exclude main product)
          const subProductsOnly = (multiProduct.subProducts || [])
            .filter((sub) => sub._id.toString() !== mainIdStr)
            .map(cleanProduct);

          responseObj.product = {
            ...cleanedMainProduct,
            subProducts: subProductsOnly,
          };
        } else {
          // Single product case
          responseObj.product = {
            ...cleanProduct(responseObj.product),
            subProducts: [],
          };
        }

        return responseObj;
      })
    );

    // ✅ Apply pagination at the end
    const total = enhancedDeals.length;
    const paginatedDeals = enhancedDeals.slice(skip, skip + limit);

    return ApiResponse.successResponse(
      res,
      200,
      "Completed closed deals fetched successfully",
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: paginatedDeals,
      }
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Failed to fetch completed closed deals"
    );
  }
};
// Get all requirements with dealStatus "pending", requirementApproved true, isDelete false
export const getApprovedPendingRequirements = async (req, res) => {
  try {
    const sellerId = req.user?.userId;
    if (!sellerId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }

    // Pagination setup
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Find approved requirements for this seller
    const approvedRequirements = await ApprovedRequirement.find({ "sellerDetails.sellerId": sellerId })
      .populate({
        path: "productId",
        populate: { path: "categoryId", select: "-subCategories" }
      })
      .populate({
        path: "sellerDetails.sellerId",
        select: "-password -__v"
      })
      .lean();

    // Helper to clean product data
    const cleanProduct = (prod) => {
      if (!prod) return prod;
      const p = { ...prod };
      if (p.userId?._id) p.userId = p.userId._id.toString();
      if (p.subCategoryId?._id) p.subCategoryId = p.subCategoryId._id;
      delete p.__v;
      return p;
    };

    // For each approved requirement, check if product is part of a multiProduct
    const enhancedRequirements = await Promise.all(
      approvedRequirements.map(async (ar) => {
        const responseObj = {
          _id: ar._id,
          createdAt: ar.createdAt,
          updatedAt: ar.updatedAt,
          product: ar.productId,
          buyer: ar.buyerId,
          sellerDetails: ar.sellerDetails,
          productCategory: ar.productCategory,
          minBudget: ar.minBudget,
          budget: ar.budget,
          date: ar.date,
        };

        if (!responseObj.product?._id) {
          responseObj.product = null;
          return responseObj;
        }

        // Find multiProduct containing this product
        const multiProduct = await multiProductSchema
          .findOne({
            $or: [
              { mainProductId: responseObj.product._id },
              { subProducts: responseObj.product._id },
            ],
          })
          .populate({
            path: "mainProductId",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .populate({
            path: "subProducts",
            populate: { path: "categoryId", select: "-subCategories" },
          })
          .lean();

        if (multiProduct?.mainProductId) {
          const mainIdStr = multiProduct.mainProductId._id.toString();
          const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);

          // Filter & clean subProducts (exclude main product)
          const subProductsOnly = (multiProduct.subProducts || [])
            .filter((sub) => sub._id.toString() !== mainIdStr)
            .map(cleanProduct);

          responseObj.product = {
            ...cleanedMainProduct,
            subProducts: subProductsOnly,
          };
        } else {
          responseObj.product = {
            ...cleanProduct(responseObj.product),
            subProducts: [],
          };
        }

        return responseObj;
      })
    );

    // ✅ Apply pagination at the end
    const total = enhancedRequirements.length;
    const paginatedRequirements = enhancedRequirements.slice(skip, skip + limit);

    return ApiResponse.successResponse(
      res,
      200,
      "Approved requirements fetched successfully",
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: paginatedRequirements,
      }
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Failed to fetch approved requirements"
    );
  }
};

  
// Close a deal (mark as completed and store deal info)
export const closeDeal = async (req, res) => {
  try {
    const { productId, buyerId, sellerId,finalBudget } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId) ||
        !mongoose.Types.ObjectId.isValid(buyerId) ||
        !mongoose.Types.ObjectId.isValid(sellerId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid productId, buyerId, or sellerId");
    }

    // Find the requirement
    const requirement = await requirementSchema.findOne({ productId, buyerId });
    if (!requirement) {
      return ApiResponse.errorResponse(res, 404, "Requirement not found");
    }

    // Find the product to get category, minBudget, budget
    const product = await productSchema.findById(productId).lean();
    if (!product) {
      return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    // Mark deal as completed
    // requirement.dealStatus = "completed";

    // Remove the seller from the sellers array
    // if (requirement.sellers && Array.isArray(requirement.sellers)) {
    //   requirement.sellers = requirement.sellers.filter(
    //     (s) => String(s.sellerId) !== String(sellerId)
    //   );
    // }

    // Create ClosedDeal document
    const closedDealData = {
      productId,
      buyerId,
      sellerId,
      budgetAmount: product.budget,
      // closedAt: new Date(),  // Not closed yet
      // date: new Date(),
      categoryId: product.categoryId,
      yourBudget: product.minimumBudget || 0,
      finalBudget: finalBudget,
      initiator: 'buyer',
      closedDealStatus: 'waiting_seller_approval',
      dealStatus: 'pending'
    };

    // Check if a deal already exists (pending or whatever)
    let closedDeal = await ClosedDeal.findOne({ productId, buyerId, sellerId });
    if (closedDeal) {
      // If it exists, update it? Or return error?
      // For now, let's update it to restart the process if it was rejected?
      // Or just return existing deal
      return ApiResponse.errorResponse(res, 400, "Deal closure already initiated or exists");
    }

    closedDeal = new ClosedDeal(closedDealData);
    await closedDeal.save();

    // Do NOT delete ApprovedRequirement yet. Wait for seller approval.

    // Save notification to database for seller
    try {
      const buyer = await userSchema.findById(buyerId).select("firstName lastName").lean();
      const buyerName = buyer?.firstName 
        ? `${buyer.firstName} ${buyer.lastName || ''}`.trim()
        : "A buyer";
      
      await productNotificationSchema.create({
        userId: sellerId,
        productId: productId,
        title: `Close deal request for ${product.title}`,
        description: `${buyerName} wants to close the deal with final budget ₹${finalBudget}`,
        seen: false
      });
      
      console.log(`Close deal notification saved for seller ${sellerId}`);
    } catch (notifError) {
      console.error("Failed to create close deal notification:", notifError.message);
    }

    // Emit real-time socket event to notify both buyer and seller about the deal request
    if (global.io && global.userSockets) {
      const dealRequestPayload = {
        deal: closedDeal,
        productId,
        buyerId,
        sellerId,
        finalBudget,
        message: "Buyer initiated close deal request"
      };

      // Notify seller
      const sellerSockets = global.userSockets.get(String(sellerId));
      if (sellerSockets) {
        for (const sockId of sellerSockets) {
          const sellerSocket = global.io.sockets.sockets.get(sockId);
          if (sellerSocket) {
            sellerSocket.emit('close_deal_request', dealRequestPayload);
          }
        }
      }
      
      console.log(`Close deal request emitted to seller ${sellerId}`);
    }

    return ApiResponse.successResponse(res, 200, "Close deal initiated successfully", closedDeal);
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to initiate close deal");
  }
};

// Respond to Close Deal Request (Seller)
export const respondToCloseDeal = async (req, res) => {
  try {
    const { dealId, action } = req.body; // action: 'accept' or 'reject'
    const sellerId = req.user?.userId;
;
    if (!dealId || !action) {
      return ApiResponse.errorResponse(res, 400, "Missing dealId or action");
    }
    
    if (!sellerId) {
        return ApiResponse.errorResponse(res, 401, "Unauthorized");
    }

    const deal = await ClosedDeal.findById(dealId);
    if (!deal) {
      return ApiResponse.errorResponse(res, 404, "Deal not found");
    }
    
    // meaningful check: ensure the user responding IS the seller
    if (deal.sellerId.toString() !== sellerId) {
        return ApiResponse.errorResponse(res, 403, "Not authorized to respond to this deal");
    }

    if (action === 'accept') {
      deal.closedDealStatus = 'completed';
      deal.dealStatus = 'accepted';
      deal.closedAt = new Date();
      deal.date = new Date();
      
      // Now we can delete the ApprovedRequirement
      await ApprovedRequirement.findOneAndDelete({
          productId: deal.productId,
          buyerId: deal.buyerId,
          "sellerDetails.sellerId": deal.sellerId
      });
      
    } else if (action === 'reject') {
      deal.closedDealStatus = 'rejected';
      deal.dealStatus = 'rejected';
    } else {
      return ApiResponse.errorResponse(res, 400, "Invalid action");
    }

    const findBuyer = await userSchema.findById(deal.buyerId);
    if(!findBuyer){
        return ApiResponse.errorResponse(res, 404, "Buyer not found");
    }
    const findSeller = await userSchema.findById(deal.sellerId);
    if(!findSeller){
        return ApiResponse.errorResponse(res, 404, "Seller not found");
    }

    const findProduct =  await productSchema.findById(deal.productId);
    if(!findProduct){
        return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    
    // create a notificaiton 
    const  buyerNotification =  await productNotificationSchema.create({
       userId: deal.buyerId,
        productId: deal.productId,
         title: `Deal Closed`,
         description:`Your ${findProduct.title} Deal has Been Closed with ${findSeller.firstName} ${findSeller.lastName}`,
         seen:false,
    })

     const  sellerNotification =  await productNotificationSchema.create({
       userId: deal.sellerId,
        productId: deal.productId,
         title: `Deal Closed`,
         description:`Your ${findProduct.title} Item Deal has Been Closed with ${findBuyer.firstName} ${findBuyer.lastName}`,
         seen:false,
    })

    await deal.save();

    // Save notification to database for buyer
    try {
      const product = await productSchema.findById(deal.productId).select("title").lean();
      const seller = await userSchema.findById(sellerId).select("firstName lastName").lean();
      const sellerName = seller?.firstName 
        ? `${seller.firstName} ${seller.lastName || ''}`.trim()
        : "Seller";
      
      const notificationTitle = action === 'accept' 
        ? `Deal accepted for ${product?.title || 'product'}`
        : `Deal rejected for ${product?.title || 'product'}`;
      
      const notificationDesc = action === 'accept'
        ? `${sellerName} accepted your close deal request. The deal is now completed!`
        : `${sellerName} rejected your close deal request.`;
      
      await productNotificationSchema.create({
        userId: deal.buyerId,
        productId: deal.productId,
        title: notificationTitle,
        description: notificationDesc,
        seen: false
      });
      
      console.log(`Close deal response notification saved for buyer ${deal.buyerId}`);
    } catch (notifError) {
      console.error("Failed to create close deal response notification:", notifError.message);
    }

    // Socket notifications
    if (global.io && global.userSockets) {
        const payload = {
            deal,
            action,
            message: `Seller ${action}ed the deal`
        };
        
        // Notify Buyer
        const buyerSockets = global.userSockets.get(String(deal.buyerId));
        if (buyerSockets) {
            for(const sockId of buyerSockets) {
                const bSocket = global.io.sockets.sockets.get(sockId);
                if(bSocket) bSocket.emit('close_deal_resolution', payload);
            }
        }
    }

    return ApiResponse.successResponse(res, 200, `Deal ${action}ed successfully`, deal);

  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(res, 500, error.message || "Failed to respond to deal");
  }
};
// Check if a closed deal exists
export const checkClosedDeal = async (req, res) => {
  try {
    const { productId, buyerId, sellerId } = req.body;
    const userId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(productId) ||
        !mongoose.Types.ObjectId.isValid(buyerId) ||
        !mongoose.Types.ObjectId.isValid(sellerId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid productId, buyerId, or sellerId");
    }

    const closedDeal = await ClosedDeal.findOne({
      productId,
      buyerId,
      sellerId
    });

    // Fetch product to identifying creator
    const product = await productSchema.findById(productId).select('userId').lean();
    const productCreatorId = product?.userId?.toString();

    const isBuyer = userId === buyerId;
    const isSeller = userId === sellerId;
    const isCreator = userId === productCreatorId;
    
    let role = 'viewer';
    if (isBuyer) role = 'buyer';
    else if (isSeller) role = 'seller';
    else if (isCreator) role = 'creator';

    // Check for ApprovedRequirement
    const approvedRequirement = await ApprovedRequirement.findOne({
      productId,
      buyerId,
      "sellerDetails.sellerId": sellerId
    }).lean();

    if (closedDeal) {
      return ApiResponse.successResponse(res, 200, "Deal found", { 
          exists: true, 
          closedDeal,
          approvedRequirement, // Return approval details if any
          status: closedDeal.closedDealStatus || 'pending',
          userRole: {
              isBuyer,
              isSeller,
              isCreator,
              role
          }
      });
    } else {
      return ApiResponse.successResponse(res, 200, "Deal not found", { 
          exists: false,
          userRole: {
              isBuyer,
              isSeller,
              isCreator,
              role
          }
      });
    }
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to check closed deal");
  }
};
// Get requirement by ID
export const getRequirementById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return ApiResponse.errorResponse(res, 400, "Invalid requirement ID");
    }

    if (!userId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }

    // Try to fetch the requirement by _id first (backward compatibility)
    let requirement = await Requirement.findById(id)
      .populate({
        path: "productId",
        populate: { path: "categoryId", select: "-subCategories" },
      })
      .populate("buyerId")
      .populate({
        path: "sellers.sellerId",
        select: "-password -__v", // exclude sensitive fields
      })
      .lean();

    // If not found by _id, try finding by productId (for multiProduct scenarios)
    if (!requirement) {
      requirement = await Requirement.findOne({ productId: id })
        .populate({
          path: "productId",
          populate: { path: "categoryId", select: "-subCategories" },
        })
        .populate("buyerId")
        .populate({
          path: "sellers.sellerId",
          select: "-password -__v",
        })
        .lean();
    }

    if (!requirement) {
      return ApiResponse.errorResponse(res, 404, "Requirement not found");
    }

    // Check if the user is the buyer or one of the sellers
    const isBuyer = requirement.buyerId._id.toString() === userId;
    const isSeller = requirement.sellers.some(s => s.sellerId._id.toString() === userId);

    if (!isBuyer && !isSeller) {
      return ApiResponse.errorResponse(res, 403, "Access denied");
    }

    // Helper to clean product data
    const cleanProduct = (prod) => {
      if (!prod) return prod;
      const p = { ...prod };

      if (p.userId?._id) p.userId = p.userId._id.toString();
      if (p.subCategoryId?._id) p.subCategoryId = p.subCategoryId._id;

      delete p.__v;
      return p;
    };

    // Manual date formatter
    const formatDate = (date) => {
      if (!date) return null;
      const d = new Date(date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0"); // months are 0-based
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    // Process the requirement similar to getBuyerRequirements
    const responseObj = {
      _id: requirement._id,
      status: requirement.status,
      createdAt: requirement.createdAt,
      updatedAt: requirement.updatedAt,
      product: requirement.productId,
      buyer: requirement.buyerId,
      sellers:
        requirement.sellers?.map((s) => ({
          seller: s.sellerId, // full populated seller object
          budgetAmount: s.budgetAmount,
          date: formatDate(s.createdAt || requirement.createdAt), // use seller's createdAt if available
        })) || [],
    };

    if (!responseObj.product?._id) {
      responseObj.product = null;
      return ApiResponse.successResponse(res, 200, "Requirement fetched successfully", responseObj);
    }

    // Find multiProduct containing this product
    const multiProduct = await multiProductSchema
      .findOne({
        $or: [
          { mainProductId: responseObj.product._id },
          { subProducts: responseObj.product._id },
        ],
      })
      .populate({
        path: "mainProductId",
        populate: { path: "categoryId", select: "-subCategories" },
      })
      .populate({
        path: "subProducts",
        populate: { path: "categoryId", select: "-subCategories" },
      })
      .lean();

    if (multiProduct?.mainProductId) {
      const mainIdStr = multiProduct.mainProductId._id.toString();
      const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);

      // Filter & clean subProducts (exclude main product)
      const subProductsOnly = (multiProduct.subProducts || [])
        .filter((sub) => sub._id.toString() !== mainIdStr)
        .map(cleanProduct);

      responseObj.product = {
        ...cleanedMainProduct,
        subProducts: subProductsOnly,
      };
    } else {
      // Single product case
      responseObj.product = {
        ...cleanProduct(responseObj.product),
        subProducts: [],
      };
    }

    return ApiResponse.successResponse(res, 200, "Requirement fetched successfully", responseObj);
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to fetch requirement");
  }
};

// Utility to approve requirement when chat starts (for product owner/buyer)
export const approveRequirementOnChatStart = async ({ productId, userId, sellerId }) => {
  try {
    if (!productId || !userId || !sellerId) {
      return { updated: false, reason: "Missing productId, userId, or sellerId" };
    }

    // Find the product
    const product = await productSchema.findById(productId).lean();
    if (!product) {
      return { updated: false, reason: "Product not found" };
    }

    // Only the buyer (product owner) can approve
    if (String(product.userId) !== String(userId)) {
      return { updated: false, reason: "User is not the product owner (buyer)" };
    }

    // Find the requirement for this product and buyer
    const requirement = await requirementSchema.findOne({ productId, buyerId: userId });
    if (!requirement) {
      return { updated: false, reason: "Requirement not found" };
    }

    let sellerDetails = null;
    if (requirement.sellers && requirement.sellers.length > 0) {
      const foundSeller = requirement.sellers.find(
        (s) => String(s.sellerId) === String(sellerId)
      );
      if (foundSeller) {
        sellerDetails = {
          sellerId: foundSeller.sellerId,
          budgetAmount: foundSeller.budgetAmount
        };
      }
    }

    // Only save if sellerDetails exists and not already approved
    if (sellerDetails) {
      // Check if already approved
      const alreadyApproved = await ApprovedRequirement.findOne({
        productId,
        buyerId: userId,
        "sellerDetails.sellerId": sellerDetails.sellerId
      });
      if (alreadyApproved) {
        return { updated: false, reason: "Already approved" };
      }

      const approvedRequirement = new ApprovedRequirement({
        productId,
        buyerId: userId,
        sellerDetails,
        productCategory: product.productCategory || (product.categoryId ? product.categoryId.toString() : ""),
        minBudget: product.minimumBudget || 0,
        budget: product.budget || "",
        date: new Date()
      });
      await approvedRequirement.save();
      return { updated: true };
    }

    return { updated: false, reason: "Seller details not found in requirement" };
  } catch (err) {
    return { updated: false, reason: err.message || "Error updating requirement" };
  }
};
