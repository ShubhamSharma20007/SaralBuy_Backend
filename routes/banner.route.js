import express from "express";
import bannerSchema from "../schemas/banner.schema.js";
import { ApiResponse } from "../helper/ApiReponse.js";
const router = express.Router();

router.get("/get-banners",async(req,res)=>{
    try {
        const banners = await bannerSchema.find().lean();
        ApiResponse.successResponse(res,200,'banners founds',banners);
    } catch (error) {
        ApiResponse.errorResponse(res,400,'something went wrong',error.message)
    }
})
export default router;