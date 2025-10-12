import express from "express";
import * as bidController from "../controllers/bid.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();


router.post("/create/:buyerId/:productId", auth, bidController.addBid);
router.get("/get-all-bid", auth, bidController.getAllBids);
router.delete("/delete-bid/:id", auth, bidController.deleteBid);
router.get('/bid-overview/:id',auth,bidController.bidOverViewbyId)
router.put('/update-bid-user-dets/:id',auth,bidController.updateBidUserDetails)
router.get('/get-three-latest-bid-and-draft', auth, bidController.getLatestThreeBidAndDraft) // fetching 3 bids and draft only
router.get('/bid-details/:id', auth, bidController.getbidDeatilsBYid);
router.get('/get-bid-by-productId/:productId',bidController.getBidByProductId)
export default router;