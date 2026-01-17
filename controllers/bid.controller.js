import Bid from "../schemas/bid.schema.js";
import mongoose from "mongoose";
import { ApiResponse } from "../helper/ApiReponse.js"
import { isValidObjectId } from "../helper/isValidId.js"
import bidSchema from "../schemas/bid.schema.js";
import productSchema from "../schemas/product.schema.js";
import requirementSchema from "../schemas/requirement.schema.js";
import userSchema from "../schemas/user.schema.js";
// Create a new bid
export const addBid = async (req, res) => {
  try {
    const { budgetQuation, status, availableBrand, earliestDeliveryDate, businessType, sellerType,
      priceBasis,
      taxes,
      freightTerms,
      paymentTerms,
      location,
      buyerNote, } = req.body;
    const { buyerId, productId } = req.params;
    const sellerId = req.user.userId;
    if (!isValidObjectId(buyerId) || !isValidObjectId(productId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid sellerId or productId");
    }
    if (!budgetQuation) {
      return ApiResponse.errorResponse(
        res,
        400,
        "budgetQuation is required"
      );
    }
    const existingBid = await Bid.findOne({ sellerId, buyerId, productId });
    if (existingBid) {
      return ApiResponse.errorResponse(res, 400, "You have already placed a bid for this product");
    }


    const bid = await Bid.create({
      sellerId,
      buyerId,
      productId,

      budgetQuation,
      status: status || "active",
      availableBrand,
      earliestDeliveryDate,
      sellerType,
      priceBasis,
      taxes,
      freightTerms,
      paymentTerms,
      location,
      buyerNote,
      businessType,
      ...(businessType === "business" && {
        businessDets: req.body.businessDets,
      }),
    });

    // Increment totalBidCount for the product
    const updatedProduct = await productSchema.findByIdAndUpdate(
      new mongoose.Types.ObjectId(productId),
      { $inc: { totalBidCount: 1 } },
      { new: true }
    );

    // Update/Create Requirement for buyer notifications
    let requirement;
    try {
      requirement = await requirementSchema.findOne({ productId, buyerId });
      if (requirement) {
        const existingSeller = requirement.sellers.find(
          (s) => String(s.sellerId) === String(sellerId)
        );
        if (existingSeller) {
          existingSeller.budgetAmount = budgetQuation;
          existingSeller.bidId = bid._id;
        } else {
          requirement.sellers.push({ sellerId, budgetAmount: budgetQuation, bidId: bid._id });
        }
        await requirement.save();
      } else {
        requirement = await requirementSchema.create({
          productId,
          buyerId,
          sellers: [{ sellerId, budgetAmount: budgetQuation, bidId: bid._id }]
        });
      }
    } catch (reqError) {
      console.error("Failed to update/create requirement for bid:", reqError.message);
    }

    // Notify buyer via socket
    if (global.io && global.userSockets) {
      const actualBuyerId = updatedProduct.userId;
      const recipientSockets = global.userSockets.get(String(actualBuyerId));
      if (recipientSockets) {
        for (const sockId of recipientSockets) {
          const recipientSocket = global.io.sockets.sockets.get(sockId);
          if (recipientSocket) {
            recipientSocket.emit('new_bid', {
              message: "New bid is placed on product",
              productId: productId,
              productTitle: updatedProduct.title,
              bidId: bid._id,
              requirementId: requirement?._id,
              sellerId: sellerId,
              totalBids: updatedProduct.totalBidCount
            });
            console.log(`Socket emission: 'new_bid' sent to buyer ${actualBuyerId} with requirementId ${requirement?._id}`);
          }
        }
      } else {
        console.log(`Socket emission: No active sockets found for buyer ${actualBuyerId}`);
      }
    }

    return ApiResponse.successResponse(
      res,
      200,
      "Bid created successfully",
      bid
    );
  } catch (err) {
    return ApiResponse.errorResponse(
      res,
      400,
      err.message || "Something went wrong while creating bid"
    );
  }
};

// Get all bids for the logged-in user (buyer)
export const getAllBids = async (req, res) => {
  try {
    const userId = req.user.userId; // Logged-in user
    const { search = "", limit = 10, page = 1, sortBy = "desc" } = req.query;
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    // Determine sort order for createdAt
    const sortOrder = sortBy === "asc" ? 1 : -1;
    // Build aggregation pipeline
    const pipeline = [
      {
        $match: { sellerId: new mongoose.Types.ObjectId(userId) }
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" }
    ];

    // Add search by product title if provided
    if (search && search.trim() !== "") {
      pipeline.push({
        $match: {
          "product.title": { $regex: search, $options: "i" }
        }
      });
    }

    // Continue pipeline
    pipeline.push(
      {
        $lookup: {
          from: "users",
          localField: "sellerId",
          foreignField: "_id",
          as: "seller"
        }
      },
      { $unwind: "$seller" },
      {
        $lookup: {
          from: "users",
          localField: "buyerId",
          foreignField: "_id",
          as: "buyer"
        }
      },
      { $unwind: "$buyer" },
      // {
      //   $project: {
      //     _id: 1,
      //     budgetQuation: 1,
      //     status: 1,
      //     availableBrand: 1,
      //     earliestDeliveryDate: 1,
      //     businessType: 1,
      //     createdAt: 1,
      //     updatedAt: 1,
      //     product: 1,
      //     seller: {
      //       _id: 1,
      //       firstName: 1,
      //       lastName: 1,
      //       email: 1,
      //       phone: 1
      //     },
      //     buyer: {
      //       _id: 1,
      //       firstName: 1,
      //       lastName: 1,
      //       email: 1,
      //       phone: 1
      //     }
      //   }
      // }
    );

    // For total count (before pagination)
    const countPipeline = [...pipeline];
    countPipeline.push({ $count: "total" });
    const countResult = await Bid.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Pagination (sort descending by createdAt)
    pipeline.push({ $sort: { createdAt: sortOrder } });
    pipeline.push({ $skip: (parsedPage - 1) * parsedLimit });
    pipeline.push({ $limit: parsedLimit });

    let bids = await Bid.aggregate(pipeline);

    // Update status if bid is older than 24 hours and still active
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;

    await Promise.all(
      bids.map(async (bid) => {
        if (
          bid.status === "active" &&
          bid.createdAt &&
          now - new Date(bid.createdAt).getTime() > twentyFourHours
        ) {
          await bidSchema.findByIdAndUpdate(bid._id, { status: "inactive" });
          bid.status = "inactive";
        }
      })
    );

    return ApiResponse.successResponse(
      res,
      200,
      "All bids fetched successfully",
      {
        total,
        page: parsedPage,
        limit: parsedLimit,
        bids
      }
    );
  } catch (err) {
    return ApiResponse.errorResponse(
      res,
      400,
      err.message || "Something went wrong while fetching bids"
    );
  }
};


// Delete a bid (only if the logged-in user is the buyer)
export const deleteBid = async (req, res) => {
  try {
    const { id } = req.params;
    // logged-in user is the seller who wants to delete their bid
    const sellerId = req.user.userId;

    const bid = await Bid.findOne({ _id: id, sellerId });
    if (!bid) {
      return ApiResponse.errorResponse(
        res,
        403,
        "Not authorized to delete this bid"
      );
    }

    try {
      await requirementSchema.findOneAndUpdate(
        { productId: bid.productId },
        { $pull: { sellers: { sellerId: bid.sellerId || sellerId } } }
      );
    } catch (e) {
      console.error("Failed to remove seller from requirement:", e.message || e);
    }

    await Bid.deleteOne({ _id: id });

    try {
      if (bid.productId) {
        await productSchema.findByIdAndUpdate(bid.productId, { $inc: { totalBidCount: -1 } });
      }
    } catch (e) {
      console.error("Failed to decrement product totalBidCount:", e.message || e);
    }

    return ApiResponse.successResponse(
      res,
      200,
      "Bid deleted successfully",

    );
  } catch (err) {
    return ApiResponse.errorResponse(
      res,
      400,
      err.message || "Something went wrong while deleting bid"
    );
  }
};
export const bidOverViewbyId = async (req, res) => {
  const { id } = req.params;

  if (!isValidObjectId(id)) {
    return ApiResponse.errorResponse(res, 400, "Invalid bid or product id");
  }

  try {
    const bid = await bidSchema.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id)
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },

      {
        $lookup: {
          from: "categories",
          let: { categoryId: "$product.categoryId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$categoryId"] }
              }
            }
          ],
          as: "productCategory"
        }
      },
      { $unwind: { path: "$productCategory", preserveNullAndEmptyArrays: true } },

      {
        $addFields: {
          "product.category": "$productCategory"
        }
      },
      {
        $project: {
          productCategory: 0
        }
      },
      {
        $addFields: {
          "product.subCategory": {
            $arrayElemAt: [
              {
                $filter: {
                  input: "$product.category.subCategories",
                  as: "sub",
                  cond: { $eq: ["$$sub._id", "$product.subCategoryId"] }
                }
              },
              0
            ]
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "sellerId",
          foreignField: "_id",
          as: "seller"
        }
      },
      { $unwind: "$seller" },

      {
        $lookup: {
          from: "users",
          localField: "buyerId",
          foreignField: "_id",
          as: "buyer"
        }
      },
      { $unwind: "$buyer" },

      {
        $project: {
          productId: 0,
          sellerId: 0,
          buyerId: 0,
          "product.categoryId": 0,
          "product.subCategoryId": 0,
        }
      }
    ]);

    if (!bid.length) {
      return ApiResponse.errorResponse(res, 404, "Bid not found");
    }

    return ApiResponse.successResponse(res, 200, "Bid overview", bid[0]);

  } catch (err) {
    return ApiResponse.errorResponse(res, 500, err.message || "Something went wrong while getting bid overview");
  }
};


export const updateBidUserDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      budgetQuation,
      availableBrand,
      earliestDeliveryDate
    } = req.body;

    const bid = await bidSchema.findByIdAndUpdate(id, { budgetQuation, availableBrand, earliestDeliveryDate }, { new: true });

    if (!bid) {
      return ApiResponse.errorResponse(res, 404, "Bid not found");
    }

    return ApiResponse.successResponse(res, 200, "Bid updated successfully", bid);

  } catch (err) {
    return ApiResponse.errorResponse(res, 500, err.message || "Something went wrong while updating bid");
  }
}

export const getLatestThreeBidAndDraft = async (req, res) => {
  try {
    const user = req.user._id
    if (!user) {
      return ApiResponse.errorResponse(res, 404, "User not found");
    }
    const bids = await bidSchema.find({ sellerId: user }).sort({ createdAt: -1 }).limit(3).populate({
      path: 'productId',
      populate: {
        path: 'categoryId'
      }
    }).lean()
    if (!bids) {
      return ApiResponse.errorResponse(res, 404, "Bid not found");
    }

    //  for draft
    const drafts = await productSchema.find({ userId: user, draft: true }).sort({ createdAt: -1 }).limit(3).populate('categoryId').lean()
    if (!drafts) {
      return ApiResponse.errorResponse(res, 404, "Draft not found");
    }

    return ApiResponse.successResponse(res, 200, "Bid fetched successfully", { bids, drafts });
  } catch (error) {
    console.log(error)
    return ApiResponse.errorResponse(res, 400, "Something went wrong while getting bid overview");

  }

}

export const getbidDeatilsBYid = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return ApiResponse.errorResponse(res, 400, "Invalid bid id");
    }

    // Pagination parameters for sellers
    const { limit = 10, page = 1 } = req.query;
    const parsedLimit = Math.max(1, parseInt(limit, 10) || 10);
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);

    // Find the bid by id
    const bid = await bidSchema.findById(id).lean();
    if (!bid) {
      return ApiResponse.errorResponse(res, 404, "Bid not found");
    }

    const productId = bid.productId;
    if (!productId) {
      return ApiResponse.errorResponse(res, 404, "Product not found in bid");
    }

    // Get all bids for this product (all sellers who bid on this product)
    let allBids = await bidSchema.find({ productId }).populate({
      path: "sellerId",
      select: "-password -__v"
    }).lean();

    // Check and update status if bid is older than 24 hours and still active
    const now = Date.now();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const bidsToUpdate = [];

    allBids = await Promise.all(
      allBids.map(async (b) => {
        if (
          b.status === "active" &&
          b.createdAt &&
          now - new Date(b.createdAt).getTime() > twentyFourHours
        ) {
          // Update status in DB
          await bidSchema.findByIdAndUpdate(b._id, { status: "inactive" });
          b.status = "inactive";
          bidsToUpdate.push(b._id);
        }
        return b;
      })
    );

    // Prepare sellers array: { seller: <sellerObj>, budgetQuation, ... }
    const sellersAll = allBids.map(b => ({
      seller: b.sellerId,
      budgetQuation: b.budgetQuation,
      availableBrand: b.availableBrand,
      earliestDeliveryDate: b.earliestDeliveryDate,
      businessType: b.businessType,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      _id: b._id
    }));

    // Pagination for sellers
    const totalSellers = sellersAll.length;
    const startIdx = (parsedPage - 1) * parsedLimit;
    const endIdx = startIdx + parsedLimit;
    const sellers = sellersAll.slice(startIdx, endIdx);

    // Get product details, including multi-product if applicable
    // Reference: requirement.controller.js getBuyerRequirements
    // (Assume multiProductSchema is imported as in requirement.controller.js)
    let product = null;
    let multiProduct = null;
    try {
      // Dynamically import multiProductSchema if not already imported
      const multiProductSchema = (await import("../schemas/multiProduct.schema.js")).default;
      // Find if this product is part of a multi-product group
      multiProduct = await multiProductSchema
        .findOne({
          $or: [
            { mainProductId: productId },
            { subProducts: productId }
          ]
        })
        .populate({
          path: "mainProductId",
          populate: { path: "categoryId", select: "-subCategories" }
        })
        .populate({
          path: "subProducts",
          populate: { path: "categoryId", select: "-subCategories" }
        })
        .lean();
    } catch (e) {
      // fallback: ignore multiProduct if import fails
      multiProduct = null;
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

    // Get the product itself
    const prodDoc = await productSchema.findById(productId)
      .populate({ path: "categoryId", select: "-subCategories" })
      .lean();

    if (multiProduct?.mainProductId) {
      const mainIdStr = multiProduct.mainProductId._id.toString();
      const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);
      // Filter & clean subProducts (exclude main product)
      const subProductsOnly = (multiProduct.subProducts || [])
        .filter((sub) => sub._id.toString() !== mainIdStr)
        .map(cleanProduct);

      product = {
        ...cleanedMainProduct,
        subProducts: subProductsOnly,
      };
    } else {
      // Single product case
      product = {
        ...cleanProduct(prodDoc),
        subProducts: [],
      };
    }

    // Fetch and attach buyer details if userId exists
    if (product && product.userId) {
      try {
        // If userId is an object, get its string value
        const buyerId = typeof product.userId === "object" && product.userId._id
          ? product.userId._id
          : product.userId;
        const buyer = await userSchema.findById(buyerId).select("-password -__v").lean();
        if (buyer) {
          product.buyer = {
            _id: buyer._id,
            firstName: buyer.firstName,
            lastName: buyer.lastName,
            email: buyer.email,
            phone: buyer.phone,
            currentLocation: buyer.currentLocation || buyer.address,
            // Add more fields as needed
          };
        }
      } catch (e) {
        // If buyer fetch fails, do nothing
      }
    }

    // If the main bid is active and older than 24 hours, update its status
    let mainBidStatus = bid.status;
    if (
      bid.status === "active" &&
      bid.createdAt &&
      now - new Date(bid.createdAt).getTime() > twentyFourHours
    ) {
      await bidSchema.findByIdAndUpdate(bid._id, { status: "inactive" });
      mainBidStatus = "inactive";
    }

    // Compose response
    // Move buyer details to top-level if present
    let buyer = null;
    if (product && product.buyer) {
      buyer = product.buyer;
      delete product.buyer;
    }

    const responseObj = {
      _id: bid._id,
      product,
      buyer,
      sellers,
      totalSellers,
      page: parsedPage,
      limit: parsedLimit,
      createdAt: bid.createdAt,
      updatedAt: bid.updatedAt,
      status: mainBidStatus
    };

    return ApiResponse.successResponse(
      res,
      200,
      "Bid details with all sellers fetched successfully",
      responseObj
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Failed to fetch bid details"
    );
  }
};

export const getBidByProductId = async (req, res) => {
  const { productId } = req.params;
  try {
    const getBidDoc = await bidSchema.exists({
      productId
    });
    if (!getBidDoc) {
      return ApiResponse.errorResponse(
        res,
        404,
        "Bid not found"
      );
    }
    return ApiResponse.successResponse(res, 200, "Bid fetched successfully", getBidDoc);
  } catch (error) {
    return ApiResponse.errorResponse(res, 400, error.message);

  }
}


