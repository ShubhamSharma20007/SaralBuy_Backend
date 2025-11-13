import express from "express";
import { signIn, signUp ,logout,getProfile} from "../../controllers/admin/auth.controller.js";
import adminAuth from "../../middleware/adminAuth.js";
const router = express.Router();

router.post("/login",signIn);
router.post('/signup',signUp);
router.get("/logout",logout);
router.get("/profile",adminAuth,getProfile);

export default router;