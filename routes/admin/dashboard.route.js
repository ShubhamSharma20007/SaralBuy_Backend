import express from "express";
import { dashboardAnaltics,populateProductsById,uploadSingleImage,bannerListing,deleteBannerById, BannerDetsById,updateBanner, allProducts,getProductById, updateProductById,getCategoriesNames,getSubCategoryCount } from "../../controllers/admin/analtics.controller.js";
import adminAuth from "../../middleware/adminAuth.js";
import {uploadProductFiles } from "../../middleware/productUploadMiddleware.js";
const router = express.Router();

router.get('/analtics',adminAuth,dashboardAnaltics)
router.get('/populate-products-by-id',adminAuth,populateProductsById)
router.post('/upload-banner',adminAuth,uploadProductFiles,uploadSingleImage)
router.get('/banner-listing',adminAuth,bannerListing)
router.delete('/delete-banner/:bannerId',adminAuth,deleteBannerById)
router.get('/get-banner/:bannerId',adminAuth,BannerDetsById)
router.put('/update-banner/:bannerId',adminAuth,uploadProductFiles,updateBanner)
router.get('/all-products',adminAuth,allProducts)
router.get('/get-product/:productId',adminAuth,getProductById)
router.put('/update-product/:productId',adminAuth,uploadProductFiles,updateProductById)
router.get('/get-categorie-names',adminAuth,getCategoriesNames)
router.get("/get-subcategory-count/:categoryId",getSubCategoryCount)
export default router;