import express from "express";
import * as requirementController from "../controllers/requirement.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Create a requirement (when a seller bids on a product)
router.post("/create", auth, requirementController.createRequirement);

// Get all requirements for the current buyer
router.get("/my-requirements", auth, requirementController.getBuyerRequirements);
router.get('/recent-requirements', requirementController.getRecentRequirements)
router.get(
  "/approved-pending",
  auth,
  requirementController.getApprovedPendingRequirements
);
router.post("/close-deal", auth, requirementController.closeDeal);
router.post("/closed-deal-check", auth, requirementController.checkClosedDeal);
router.get(
  "/completed-approved",
  auth,
  requirementController.getCompletedApprovedRequirements
);
router.get("/get-requirement/:id", auth, requirementController.getRequirementById);

// Get all notifications for buyer: products with at least one bid
router.get(
  "/bid-notifications",
  auth,
  requirementController.getBuyerBidNotifications
);

router.delete('/delete-requirement/:productId',auth,requirementController.deleteRequirement)

export default router;