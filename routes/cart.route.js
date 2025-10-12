import express from "express";
import { addToCart, getUserCart,removeCart } from "../controllers/cart.controller.js";
import auth from "../middleware/auth.js";

const router = express.Router();

// Add to cart (requires authentication)
router.post("/add", auth, addToCart);

// Get all cart items for the logged-in user
router.get("/get-cart", auth, getUserCart);
router.post("/remove-cart/:cartId/:productId",auth,removeCart);

export default router;