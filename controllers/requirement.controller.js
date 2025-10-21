import Requirement from "../schemas/requirement.schema.js";
import productSchema from "../schemas/product.schema.js";
import multiProductSchema from "../schemas/multiProduct.schema.js";
import { ApiResponse } from "../helper/ApiReponse.js";
import mongoose from "mongoose";
import requirementSchema from "../schemas/requirement.schema.js";
import ApprovedRequirement from "../schemas/approvedRequirement.schema.js";
import ClosedDeal from "../schemas/closedDeal.schema.js";

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

    // Fetch requirements with populated product + sellers
    const requirements = await Requirement.find({ buyerId })
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

    // Process requirements
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
              seller: s.sellerId, // full populated seller object
              budgetAmount: s.budgetAmount,
              date: formatDate(s.createdAt || requirement.createdAt), // use seller's createdAt if available
            })) || [],
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
    // const ownedProducts = await productSchema
    //   .find({ userId: buyerId })
    //   .populate({ path: "categoryId", select: "-subCategories" })
    //   .lean();

    // const requirementProductIds = new Set(
    //   requirements.map((req) => req.productId?._id?.toString() || (req.productId ? req.productId.toString() : ""))
    // );

    // const additionalRequirements = await Promise.all(
    //   ownedProducts
    //     .filter((prod) => !requirementProductIds.has(prod._id.toString()))
    //     .map(async (prod) => {
    //       const multiProduct = await multiProductSchema
    //         .findOne({
    //           $or: [
    //             { mainProductId: prod._id },
    //             { subProducts: prod._id },
    //           ],
    //         })
    //         .populate({
    //           path: "mainProductId",
    //           populate: { path: "categoryId", select: "-subCategories" },
    //         })
    //         .populate({
    //           path: "subProducts",
    //           populate: { path: "categoryId", select: "-subCategories" },
    //         })
    //         .lean();

    //       let productObj;
    //       if (multiProduct?.mainProductId) {
    //         const mainIdStr = multiProduct.mainProductId._id.toString();
    //         const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);

    //         const subProductsOnly = (multiProduct.subProducts || [])
    //           .filter((sub) => sub._id.toString() !== mainIdStr)
    //           .map(cleanProduct);

    //         productObj = {
    //           ...cleanedMainProduct,
    //           subProducts: subProductsOnly,
    //         };
    //       } else {
    //         // Single product case
    //         productObj = {
    //           ...cleanProduct(prod),
    //           subProducts: [],
    //         };
    //       }

    //       return {
    //         _id: prod._id, // Use product _id as unique id for this pseudo-requirement
    //         status: "owned", // or any custom status to indicate it's not a real requirement
    //         createdAt: prod.createdAt,
    //         updatedAt: prod.updatedAt,
    //         product: productObj,
    //         buyer: buyerId,
    //         sellers: [],
    //       };
    //     })
    // );

    // Merge and return
    let allRequirements = [...enhancedRequirements];
    
    // Remove duplicate products (by product._id), keeping the first occurrence
    const seenProductIds = new Set();
    allRequirements = allRequirements.filter(req => {
      const prodId = req.product && req.product._id ? req.product._id.toString() : null;
      if (!prodId) return true; // keep if no product id
      if (seenProductIds.has(prodId)) return false;
      seenProductIds.add(prodId);
      return true;
    });
    
    return ApiResponse.successResponse(
      res,
      200,
      "Buyer requirements fetched successfully",
      allRequirements
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
export const getRecentRequirements = async(req,res)=>{
  try {
    const requirements = await requirementSchema.find().sort({ createdAt: -1 }).limit(3).populate([
      {path:'productId',select:'title quantity image',populate:{path:"categoryId",select:"categoryName"}},
      {path:'buyerId',select:"firstName lastName currentLocation"},
    ]).select('createdAt').lean();
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

    return ApiResponse.successResponse(
      res,
      200,
      "Completed closed deals fetched successfully",
      enhancedDeals
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

    // Find approved requirements for this seller from ApprovedRequirement collection
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
          // Single product case
          responseObj.product = {
            ...cleanProduct(responseObj.product),
            subProducts: [],
          };
        }

        return responseObj;
      })
    );

    return ApiResponse.successResponse(
      res,
      200,
      "Approved requirements fetched successfully",
      enhancedRequirements
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
      closedAt: new Date(),
      date: new Date(),
      categoryId: product.categoryId,
      yourBudget: product.minimumBudget,
      finalBudget: finalBudget
    };

    const closedDeal = new ClosedDeal(closedDealData);
    await closedDeal.save();

    // Delete the ApprovedRequirement document for this deal
    const deletedApprovedReq = await ApprovedRequirement.findOneAndDelete({
      productId: new mongoose.Types.ObjectId(productId),
      buyerId: new mongoose.Types.ObjectId(buyerId),
      "sellerDetails.sellerId": new mongoose.Types.ObjectId(sellerId)
    });
    
    // Log deletion result for debugging
    if (deletedApprovedReq) {
      console.log("Approved requirement deleted successfully:", deletedApprovedReq._id);
    } else {
      console.log("No approved requirement found to delete for this combination");
    }

    // await requirement.save();

    return ApiResponse.successResponse(res, 200, "Deal closed successfully", closedDeal);
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to close deal");
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

    // Fetch the requirement with populated product + sellers
    const requirement = await Requirement.findById(id)
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
