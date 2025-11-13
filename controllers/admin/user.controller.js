import mongoose from "mongoose";
import { ApiResponse } from "../../helper/ApiReponse.js";
import userSchema from "../../schemas/user.schema.js";

export const getUser = async (req, res) => {
  try {
    let { page = 1, limit = 10,text=null } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;
    let query = { role: 'user' };
    if(text && text.trim()!==''){
        query['$or'] =[
            { firstName: { $regex: text, $options: 'i' } },
            { lastName: { $regex: text, $options: 'i' } },
            { email: { $regex: text, $options: 'i' } },
            { phone: { $regex: text, $options: 'i' } },
            { address: { $regex: text, $options: 'i' } },
        ]
    }

    const users = await userSchema.find(query).skip(skip).limit(limit);
    const totalUsers = await userSchema.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / limit);
    ApiResponse.successResponse(res, 200, 'users fetched', {
      users,
      page,
      totalPages,
      totalUsers,
    });
  } catch (error) {
    ApiResponse.errorResponse(res, 400, error.message);
  }
};


export const getUserById = async (req,res)=>{
    try {
        const {id}=req.params;
        if(!mongoose.Types.ObjectId.isValid(id)){
            return ApiResponse.errorResponse(res,400,'Invalid user ID');    
        }
        const user = await userSchema.findById(id);
        if(!user){
            return ApiResponse.errorResponse(res,404,'User not found');
        }
        return ApiResponse.successResponse(res,200,'User fetched successfully',user);
    } catch (error) {
        return ApiResponse.errorResponse(res,400,error.message);
    }
}

export const updateUserById = async (req,res)=>{
    const {id}=req.params;
    try {
        const user = await userSchema.findByIdAndUpdate(id,req.body,{new:true});
        if(!user){
            return ApiResponse.errorResponse(res,404,'User not found');
        }
        return ApiResponse.successResponse(res,200,'User updated successfully',user);
    } catch (error) {
        return ApiResponse.errorResponse(res,400,error.message);
        
    }
}