import { ApiResponse } from "../../helper/ApiReponse.js";
import { deleteFileFromS3 } from "../../helper/deleteFileFromS3.js";
import bannerSchema from "../../schemas/banner.schema.js";
import productSchema from "../../schemas/product.schema.js";
import requirementSchema from "../../schemas/requirement.schema.js";
import userSchema from "../../schemas/user.schema.js";
export const dashboardAnaltics = async (req, res) => {
    try {
        const activeUsers = await userSchema.find({status:'active'}).countDocuments();
        const inactiveUsers = await userSchema.find({status:'inactive'}).countDocuments ();
        const user = await userSchema.find().countDocuments();
        const products = await productSchema.find().countDocuments();
        const requirements = await requirementSchema.find().countDocuments();
        const recentProductCreated =  await productSchema.find({draft:false}).sort({createdAt:-1}).limit(5).populate({
            path:"categoryId",
            select:'categoryName'
        });
        ApiResponse.successResponse(res,201,'dashbaoard data fetched',{users:{
            activeUsers,inactiveUsers,user
        },products,requirements,recentProductCreated})
    } catch (error) {
        ApiResponse.errorResponse(res,500,error.message)
        
    }
};

export  const populateProductsById = async(req,res)=>{
    const categoryId = req.query.categoryId;
    try {
        if(!categoryId){
            const products = await productSchema.aggregate([
    {
        $group: {
            _id: '$categoryId',
            productCount: { $sum: 1 }
        }
    },
    {
        $lookup: {
            from: 'categories',
            localField: '_id',
            foreignField: '_id',
            as: 'category'
        }
    },
    {
        $unwind: '$category'
    },
    {
        $project: {
            categoryName: '$category.categoryName',
            productCount: 1
        }
    }
])
            ApiResponse.successResponse(res,201,'products fetched',products)
        }
        else{
            const products = await productSchema.aggregate([
                {
                    $match:{categoryId}
                },
                {
                    $group:{
                        _id:'$categoryId',
                        products:{$push:'$_id'}
                    }
                }
            ])
            ApiResponse.successResponse(res,201,'products fetched',products)
        }
    } catch (error) {
        ApiResponse.errorResponse(res,500,error.message)
        
    }
}


export const uploadSingleImage = async (req,res)=>{
    const bucket = req.files?.image?.[0]?.location;
    const imageKey = req.files?.image?.[0]?.key;
    try {
        if(!bucket){
        return ApiResponse.errorResponse(res,400,'No file uploaded');   
        }
        await bannerSchema.create({
            imageUrl:bucket,
            imageKey,
            linkUrl:req.body.target_link,
            title:req.body.title
        })

        ApiResponse.successResponse(res,201,'Image uploaded successfully',bucket)       
    } catch (error) {
        console.log(error)
        ApiResponse.errorResponse(res,400,error.message)
    }
}

export const bannerListing = async (req,res)=>{
    try {
        let { page = 1, limit = 10 } = req.query;
        page = parseInt(page);
        limit = parseInt(limit);
        const skip = (page - 1) * limit;
        const banners = await bannerSchema.find().skip(skip).limit(limit);
        const totalBanners = await bannerSchema.countDocuments();
        const totalPages = Math.ceil(totalBanners / limit);
        ApiResponse.successResponse(res, 200, 'users fetched', {
          banners,
          page,
          totalPages,
          totalBanners,
        });
      } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
      }
}
export const deleteBannerById = async (req,res)=>{
    const { bannerId } = req.params;
    try {
        const banner = await bannerSchema.findByIdAndDelete(bannerId);
        if (!banner) {
            return ApiResponse.errorResponse(res, 404, 'Banner not found');
        }
        console.log({banner})
        await deleteFileFromS3(banner.imageKey)
        ApiResponse.successResponse(res, 200, 'Banner deleted successfully');
      } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
      } 
}


export const BannerDetsById = async (req,res)=>{
    const { bannerId } = req.params;
    try {
        const banner = await bannerSchema.findById(bannerId).lean()
        if (!banner) {
            return ApiResponse.errorResponse(res, 404, 'Banner not found');
        }
        ApiResponse.successResponse(res, 200, 'Banner details fetched', banner);
      } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
      }
}

export const updateBanner =async(req,res)=>{
    const { bannerId } = req.params;
    const { title, linkUrl} = req.body;
    const bucket = req.files?.image?.[0]?.location|| ''
    const imageKey = req.files?.image?.[0]?.key|| ''
    try {
        const banner = await bannerSchema.findById(bannerId);
        if (!banner) {
            return ApiResponse.errorResponse(res, 404, 'Banner not found');
        }
        // remove the banner from aws
        if(bucket && imageKey){ 
        await deleteFileFromS3(banner.imageKey);
        banner.imageUrl = bucket
        banner.imageKey=  imageKey
    }
        banner.title = title;
        banner.linkUrl = linkUrl;
        await banner.save();
        ApiResponse.successResponse(res, 200, 'Banner updated successfully',banner);
    } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
        
    }
}
export const allProducts = async (req, res) => {
  try {
    let { page = 1, limit = 10, text = null } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const matchStage = {};
    if (text && text.trim() !== '') {
      matchStage['$or'] = [
        { title: { $regex: text, $options: 'i' } },
        { brand: { $regex: text, $options: 'i' } },
        { description: { $regex: text, $options: 'i' } },
        { 'categoryId.categoryName': { $regex: text, $options: 'i' } }, 
      ];
    }

    const products = await productSchema.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryId',
        },
      },
      { $unwind: { path: '$categoryId', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalCountResult = await productSchema.aggregate([
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryId',
        },
      },
      { $unwind: { path: '$categoryId', preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $count: 'total' },
    ]);

    const totalProducts = totalCountResult[0]?.total || 0;
    const totalPages = Math.ceil(totalProducts / limit);

    ApiResponse.successResponse(res, 200, 'products fetched', {
      products,
      page,
      totalPages,
      totalProducts,
    });
  } catch (error) {
    console.log(error);
    ApiResponse.errorResponse(res, 400, error.message);
  }
};

export const getProductById = async (req,res)=>{
    const {productId}= req.params;
    try {
        const product=await productSchema.findById(productId).populate('categoryId');
        ApiResponse.successResponse(res,200,'product fetched',product);
    } catch (error) {
        ApiResponse.errorResponse(res,400,error.message);
    }
}

export const updateProductById = async (req,res)=>{
    const {productId}= req.params;
    console.log(req.files)
      const { title, description,minimumBudget} = req.body;
      if(minimumBudget < 0){
        return ApiResponse.errorResponse(res,400,'Minimum budget should be greater than 0');
      }
       let bucket,imageKey;
    try {
        const product = await productSchema.findById(productId).populate("categoryId");
         if (!product) {
            return ApiResponse.errorResponse(res, 404, 'Product not found');
        }
        // if(product.imageKey){
        //     bucket == req.files?.image?.[0]?.location|| ''
        //     imageKey =  req.files?.image?.[0]?.key|| ''
        // }
       
        // remove the product from aws
    //     if(product && product.imageKey){ 
    //     await deleteFileFromS3(product.imageKey);
    //     product.image = bucket
    //     product.imageKey=  imageKey
    // }
        if(req.files?.image?.[0]?.location){
            product.image = req.files?.image?.[0]?.location
        }
        product.minimumBudget = minimumBudget;
        product.title = title;
        product.description = description;
        await product.save();
        ApiResponse.successResponse(res, 200, 'product updated successfully',product);
    } catch (error) {
        ApiResponse.errorResponse(res, 400, error.message);
        
    }
}