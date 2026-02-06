import express from 'express';
import { addProduct, getProducts, updateProduct, deleteProduct, searchProductsController, getProductByName, getProductById, getDraftProducts, getMultiProduct, updateDraftStatus, getAllDraftProducts,getDraftProductById, getUnseenProductNotifications, markProductNotificationSeen, deleteProductNotification, getHomeProducts,saveAsDraft,deleteDraftProduct } from '../controllers/product.controller.js';
import uploadSingleImage from '../middleware/uploadMiddleware.js';
import { uploadProductFiles } from '../middleware/productUploadMiddleware.js';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/add-product/:categoryId/:subCategoryId/:isMultiple', auth, uploadProductFiles, addProduct);
router.get('/get-products/:categoryId/:subCategoryId', getProducts);
router.get('/get-products-by-title/search', searchProductsController);
router.put('/update-product/:productId', uploadSingleImage, updateProduct);
router.delete('/delete-product/:productId', deleteProduct);
router.get('/get-product/:productName', getProductByName);
router.get('/get-product-by-id/:productId', getProductById);
router.get('/get-draft-products', auth, getAllDraftProducts);
router.get('/get-draft-product/:productId', auth, getDraftProductById);
router.patch("/updatedraft/:isMultiple", auth,uploadProductFiles, updateDraftStatus);
router.get('/get-home-products',getHomeProducts);
router.delete('/delete-draft-product/:productId',auth,deleteDraftProduct)

router.get('/notifications/unseen', auth, getUnseenProductNotifications);
router.post('/notifications/mark-seen', auth, markProductNotificationSeen);
router.delete('/notifications/:notificationId', auth, deleteProductNotification);
router.put('/save_as_draft/:isMultiple',auth, uploadProductFiles, saveAsDraft);
export default router;
