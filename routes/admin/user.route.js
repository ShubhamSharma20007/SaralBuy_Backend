import express from "express";
import { getUser,getUserById ,updateUserById} from "../../controllers/admin/user.controller.js";
import adminAuth from "../../middleware/adminAuth.js";
const router = express.Router();


router.get('/get-users',adminAuth,getUser)
router.get('/get-user/:id',adminAuth,getUserById)
router.put('/update-user/:id',adminAuth,updateUserById)


export default router;