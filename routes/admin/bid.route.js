import express from 'express';
import { adminGetBidListing,getBidById } from '../../controllers/admin/bid.controller.js';
import adminAuth from '../../middleware/adminAuth.js';

const router = express.Router();

router.get("/bid-listing",adminAuth,adminGetBidListing)
router.get("/get-bid-by-id/:id",adminAuth,getBidById)

export default router;