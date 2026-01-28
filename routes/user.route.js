import express from 'express';
import * as userController from '../controllers/user.controller.js';
import auth from '../middleware/auth.js';
import upload from '../middleware/multer.js';
import uploadSingleImage from '../middleware/uploadMiddleware.js';

const router = express.Router();
router.post('/send-otp',userController.sendOtp);
router.post('/verify-otp',userController.verifyOtp);
router.post('/logout', auth, userController.logoutUser);

router.get('/profile', auth, userController.getProfile);
router.post('/update-profile', auth,uploadSingleImage, userController.updateProfile);  

router.post('/address', auth, userController.addAddress);
router.get('/logout',auth,userController.logout)

router.post('/aadhaar', auth, upload.single('aadhaarImage'), userController.verifyAadhaar);

export default router;