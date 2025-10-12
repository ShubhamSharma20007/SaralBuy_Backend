import categorySchema from "../schemas/category.schema.js"
import { ApiResponse } from "../helper/ApiReponse.js"
import mongoose from "mongoose";
import {isValidObjectId}  from "../helper/isValidId.js"

const CreateCategories = async (req, res) => {
    let { categoryName, subCategories, title, description } = req.body || {};

    if (typeof subCategories === "string") {
        try {
            subCategories = JSON.parse(subCategories);
        } catch (err) {
            return ApiResponse.errorResponse(res, 400, "Invalid subCategories format, must be JSON array");
        }
    }

    // Validation
    if (!categoryName?.length || !Array.isArray(subCategories) || !subCategories.length) {
        return ApiResponse.errorResponse(res, 400, 'Category name and subcategories are required');
    }

    try {
        // Store only Cloudinary URL
        // For S3, multer-s3 puts the file location in .location
        const image = req.file?.location || req.file?.path || req.files?.image?.[0]?.location || req.files?.image?.[0]?.path || null;

        const category = new categorySchema({
            categoryName,
            subCategories,
            title,
            description,
            image
        });

        await category.save();

        return ApiResponse.successResponse(res, 200, 'Category created successfully', category);
    } catch (error) {
        console.error(error);
        return ApiResponse.errorResponse(res, 500, error?.message || 'Server error');
    }
};
const GetCategories = async(req,res)=>{
    try {
        const categories = await categorySchema.find().lean();
        return ApiResponse.successResponse(res,200,'categories fetched successfully',categories)
    } catch (error) {
        return ApiResponse.errorResponse(res,400,error?.response||error,null)
        
    }

}

// Update Category
const UpdateCategory = async (req, res) => {
    const { categoryId } = req.params;
    let { categoryName, subCategories, title, description } = req.body || {};

    if (!isValidObjectId(categoryId)) {
        return ApiResponse.errorResponse(res, 400, "Invalid category ID");
    }

    if (typeof subCategories === "string") {
        try {
            subCategories = JSON.parse(subCategories);
        } catch (err) {
            return ApiResponse.errorResponse(res, 400, "Invalid subCategories format, must be JSON array");
        }
    }

    try {
        const category = await categorySchema.findById(categoryId);
        if (!category) return ApiResponse.errorResponse(res, 404, "Category not found");

        // Update fields if provided
        if (categoryName) category.categoryName = categoryName;
        if (title) category.title = title;
        if (description) category.description = description;
        if (Array.isArray(subCategories) && subCategories.length) category.subCategories = subCategories;

        // Update image if uploaded
        // For S3, multer-s3 puts the file location in .location
        if (req.file?.location) {
            category.image = req.file.location;
        } else if (req.file?.path) {
            category.image = req.file.path;
        } else if (req.files?.image?.[0]?.location) {
            category.image = req.files.image[0].location;
        } else if (req.files?.image?.[0]?.path) {
            category.image = req.files.image[0].path;
        }

        await category.save();
        return ApiResponse.successResponse(res, 200, "Category updated successfully", category);
    } catch (error) {
        console.error(error);
        return ApiResponse.errorResponse(res, 500, error?.message || "Server error");
    }
};


const GetCategoriesById = async(req,res)=>{
    const {categoryId}  = req.params;
    try {
        if(!isValidObjectId(categoryId)) return ApiResponse.errorResponse(res, 400, "Invalid category ID");
        const category = await categorySchema.findById(categoryId)
        if (!category) return ApiResponse.errorResponse(res, 404, "Category not found");
        return ApiResponse.successResponse(res, 200, "Category fetched successfully", category);
    }
    catch(err){
        console.log(err)
        return ApiResponse.errorResponse(res, 400, err.message);
    }
}

export{
    GetCategoriesById,
    CreateCategories,
    GetCategories,
    UpdateCategory
}