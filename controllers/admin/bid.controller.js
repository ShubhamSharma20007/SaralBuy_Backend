import mongoose from "mongoose";
import { ApiResponse } from "../../helper/ApiReponse.js"
import bidSchema from "../../schemas/bid.schema.js"

export const adminGetBidListing = async (req, res) => {
    try {
        let { page = 1, limit = 10, text = null } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const skip = (page - 1) * limit;
        const matchQuery = {};
        if (text && text.trim() !== "") {
            matchQuery['$or'] =[
            {"product.title":{ $regex: text, $options: "i" }},
            {"product.brand":{ $regex: text, $options: "i" }},
            {"buyerId.firstName" : { $regex: text, $options: "i" }},
            {"buyerId.lastName" : { $regex: text, $options: "i" }},
            {"sellerId.firstName" : { $regex: text, $options: "i" }},
            {"sellerId.lastName" : { $regex: text, $options: "i" }},

            ]
        }

        const pipeline = [

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
            from: "users",
            localField: "sellerId",
            foreignField: "_id",
            as: "sellerId"
        }
    },
    { $unwind: "$sellerId" },

    {
        $lookup: {
            from: "users",
            localField: "buyerId",
            foreignField: "_id",
            as: "buyerId"
        }
    },
    { $unwind: "$buyerId" },

    {
        $match: matchQuery
    },

    {
        $group: {
            _id: "$product._id",
            productDetails: { $first: "$product" },
            productOnBids : {$push:"$$ROOT"},  // $ROOT will include all fields from the document
            totalBidsPerProduct: { $sum: 1 }
        }
    },
    { $sort: { "_id": -1 } },
    { $skip: skip },
    { $limit: limit }
];

        const bids = await bidSchema.aggregate(pipeline);

        const totalPipeline = [
            {
                $lookup: {
                    from: "products",
                    localField: "productId",
                    foreignField: "_id",
                    as: "productId"
                }
            },
            { $unwind: "$productId" },
            { $match: matchQuery },
            { $count: 'total' }
        ];


        const totalResult = await bidSchema.aggregate(totalPipeline);
        const totalBids = totalResult.length ? totalResult[0].total : 0;
        return ApiResponse.successResponse(res, 200, "Bid listing fetched successfully", {
            bids,
            page,
            totalPages: Math.ceil(totalBids / limit),
            totalBids
        });

    } catch (err) {
        console.error(err);
        return ApiResponse.errorResponse(res, 400, "Internal server error", err);
    }
};


export const getBidById = async (req, res) => {
    const { id } = req.params;
    try {
        let { page = 1, limit = 10, text = null } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);
        const skip = (page - 1) * limit;

        const matchQuery = {
            productId: new mongoose.Types.ObjectId(id)
        };

        if (text && text.trim() !== "") {
            matchQuery["$or"] = [
                // { "productId.minimumBudget": { $regex: text, $options: "i" } },
                { "buyerId.firstName": { $regex: text, $options: "i" } },
                { "buyerId.lastName": { $regex: text, $options: "i" } },
                { "sellerId.firstName": { $regex: text, $options: "i" } },
                { "sellerId.lastName": { $regex: text, $options: "i" } }
            ];
        }

        const pipeline = [
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
                    from: "users",
                    localField: "sellerId",
                    foreignField: "_id",
                    as: "sellerId"
                }
            },
            { $unwind: "$sellerId" },
            {
                $lookup: {
                    from: "users",
                    localField: "buyerId",
                    foreignField: "_id",
                    as: "buyerId"
                }
            },
            { $unwind: "$buyerId" },

            { $match: matchQuery },
            {
                $group: {
                    _id: "$product._id",
                    productDetails: { $first: "$product" },
                    productOnBids: { $push: "$$ROOT" },
                    totalBidsPerProduct: { $sum: 1 }
                }
            },

            { $sort: { "_id": -1 } },
            { $skip: skip },
            { $limit: limit }
        ];

        const result = await bidSchema.aggregate(pipeline);
        const totalCount = await bidSchema.countDocuments({
            productId: new mongoose.Types.ObjectId(id)
        });

        return ApiResponse.successResponse(res, 200, "Bid listing fetched successfully", {
            bids: result.length ? result[0] : null,
            page,
            totalPages: Math.ceil(totalCount / limit),
            totalBids: totalCount
        });

    } catch (err) {
        console.error(err);
        return ApiResponse.errorResponse(res, 400, "Internal server error", err);
    }
};
