import mongoose from "mongoose";
import { ApiResponse } from "../../helper/ApiReponse.js";
import requirementSchema from "../../schemas/requirement.schema.js";

export const adminRequirementListing = async (req, res) => {
  let { page = 1, limit = 10, text = null } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;

  const matchQuery = {};

  if (text && text.trim() !== "") {
    matchQuery["$or"] = [
      { "productId.title": { $regex: text, $options: "i" } },
      { "productId.brand": { $regex: text, $options: "i" } },
      { "buyerId.firstName": { $regex: text, $options: "i" } },
      { "buyerId.lastName": { $regex: text, $options: "i" } },
    ];
  }

  const commonPipeline = [
    {
      $lookup: {
        from: "products",
        localField: "productId",
        foreignField: "_id",
        as: "productId"
      }
    },
    { $unwind: "$productId" },

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
      $lookup: {
        from: "users",
        let: {
          sellersIds: {
            $map: {
              input: "$sellers",
              as: "s",
              in: {
                $toObjectId: "$$s.sellerId"
              }
            }
          }
        },
        pipeline: [
          { $match: { $expr: { $in: ["$_id", "$$sellersIds"] } } }
        ],
        as: "sellerUsers"
      },
    },

    {
      $addFields: {
        sellers: "$sellerUsers"
      }
    },

    { $project: { sellerUsers: 0 } }
  ];

  try {

    const listingPipeline = [
      ...commonPipeline,
        { $addFields: { sellerCount: { $size: "$sellers" } } },
      { $match: { sellerCount: { $gt: 0 }, ...matchQuery } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const requirements = await requirementSchema.aggregate(listingPipeline);

    const countPipeline = [
      ...commonPipeline,
        { $addFields: { sellerCount: { $size: "$sellers" } } },
      { $match: { sellerCount: { $gt: 0 }, ...matchQuery } },
      {$count:'total'}
    ];


    const countResult = await requirementSchema.aggregate(countPipeline);
    console.log(countResult,3)
    const totalRequirements =countPipeline.length ? countResult[0]?.total : 0


    ApiResponse.successResponse(res, 200, 'Requirements fetched successfully!', {
      requirements,
      totalPages: Math.ceil(totalRequirements / limit),
      currentPage: page,
      totalRequirements
    });

  } catch (error) {
    ApiResponse.errorResponse(res, 400, error?.message || error, null);
  }
};
export const requirementListingById = async (req, res) => {
  try {
    const { id } = req.params;
    let { page = 1, limit = 10, text = "" } = req.query;

    console.log(req.query)
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const matchIdStage = {
      $match: { _id: new mongoose.Types.ObjectId(id) }
    };

    const searchMatchStage = text.trim()
      ? {
          $match: {
            "sellers.firstName": { $regex: text, $options: "i" },
          }
        }
      : { $match: {} };

    const pipeline = [
      matchIdStage,
        { $lookup: { from: "products", localField: "productId", foreignField: "_id", as: "productId", }, }, { $unwind: "$productId" }, { $lookup: { from: "users", localField: "buyerId", foreignField: "_id", as: "buyerId", }, }, { $unwind: "$buyerId" },
      {
        $lookup: {
          from: "users",
          let: {
            sellersIds: {
              $map: {
                input: "$sellers",
                as: "s",
                in: { $toObjectId: "$$s.sellerId" },
              },
            },
          },
          pipeline: [
            {
              $match: { $expr: { $in: ["$_id", "$$sellersIds"] } },
            },
           
          ],
          as: "sellersPopulate",
        },
      },
      searchMatchStage,
      {
        $addFields: {
          sellers: {
            $map: {
              input: "$sellers",
              as: "s",
              in: {
                _id: "$$s._id",
                budgetAmount: "$$s.budgetAmount",
                sellerId: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$sellersPopulate",
                        as: "u",
                        cond: { $eq: ["$$u._id", { $toObjectId: "$$s.sellerId" }] }
                      }
                    },
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          productId: 1,
          buyerId: 1,
          createdAt: 1,
          sellers: { $slice: ["$sellers", skip, limit] }
        }
      }
    ];

    const [result] = await requirementSchema.aggregate(pipeline);

    return ApiResponse.successResponse(res, 200, "Fetched!", {
      requirement: result,
      currentPage: page,
      totalSellerCount: result?.sellers?.length ?? 0,
      totalSellerPages: Math.ceil((result?.sellers?.length ?? 0) / limit)
    });

  } catch (error) {
    return ApiResponse.errorResponse(res, 400, error.message);
  }
};

