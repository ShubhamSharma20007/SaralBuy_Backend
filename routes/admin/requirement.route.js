import express from "express";
import adminAuth from "../../middleware/adminAuth.js";
import { adminRequirementListing,requirementListingById } from "../../controllers/admin/requirement.controller.js";
const router = express.Router();

router.get('/get-requirement-listing',adminAuth,adminRequirementListing)
router.get('/get-requirement-listing-by-id/:id',adminAuth,requirementListingById)
export default router;