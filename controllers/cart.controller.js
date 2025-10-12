import Cart from "../schemas/cart.schema.js";
import productSchema from "../schemas/product.schema.js";
import multiProductSchema from "../schemas/multiProduct.schema.js";
import { ApiResponse } from "../helper/ApiReponse.js";
import mongoose from "mongoose";

// Add to cart controller
export const addToCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { productId } = req.body;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing userId");
    }
    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing productId");
    }

    // Check if product exists
    const product = await productSchema.findById(productId);
    if (!product) {
      return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    // Check if product is part of a multiProduct (as main or subproduct)
    const multiProduct = await multiProductSchema
      .findOne({
        $or: [
          { mainProductId: productId },
          { subProducts: productId },
        ],
      })
      .populate("mainProductId")
      .populate("subProducts")
      .lean();

    let productIdsToAdd = [];

    if (multiProduct?.mainProductId) {
      // Add main product and all subproducts
      const mainIdStr = multiProduct.mainProductId._id.toString();
      productIdsToAdd = [
        mainIdStr,
        ...(multiProduct.subProducts || [])
          .map((sub) => sub._id.toString())
          .filter((id) => id !== mainIdStr),
      ];
    } else {
      // Single product
      productIdsToAdd = [productId];
    }

    // Find or create cart for user
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, cartItems: [] });
    }

    // Avoid adding duplicate sets of productIds
    const existingSet = cart.cartItems.find((item) => {
      if (item.productIds.length !== productIdsToAdd.length) return false;
      const itemIds = item.productIds.map((id) => id.toString()).sort();
      const toAddSorted = [...productIdsToAdd].sort();
      return JSON.stringify(itemIds) === JSON.stringify(toAddSorted);
    });

    if (existingSet) {
      return ApiResponse.successResponse(res, 200, "Product(s) already in cart", cart);
    }

    cart.cartItems.push({ productIds: productIdsToAdd });
    await cart.save();
    

    return ApiResponse.successResponse(res, 201, "Product(s) added to cart", cart);
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to add to cart");
  }
};
// Get all cart items for the logged-in user, with single/multiProduct logic
export const getUserCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }

    const cart = await Cart.findOne({ userId }).lean();
    if (!cart || !cart.cartItems.length) {
      return ApiResponse.successResponse(res, 200, "Cart is empty", []);
    }

    // Helper to clean product data
    const cleanProduct = (prod) => {
      if (!prod) return prod;
      const p = { ...prod };
      if (p.userId?._id) p.userId = p.userId._id.toString();
      if (p.subCategoryId?._id) p.subCategoryId = p.subCategoryId._id;
      delete p.__v;
      return p;
    };

    // For each cartItem, build product info (single or multi)
    const enhancedCartItems = await Promise.all(
      cart.cartItems.map(async (item) => {
        // If only one productId, check if it's part of a multiProduct
        if (item.productIds.length === 1) {
          const productId = item.productIds[0];
          const product = await productSchema.findById(productId)
            .populate({ path: "categoryId", select: "-subCategories" })
            .lean();

          if (!product) {
            return { product: null, subProducts: [] };
          }

          // Check if this product is part of a multiProduct
          const multiProduct = await multiProductSchema
            .findOne({
              $or: [
                { mainProductId: productId },
                { subProducts: productId },
              ],
            })
            .populate({
              path: "mainProductId",
              populate: { path: "categoryId", select: "-subCategories" },
            })
            .populate({
              path: "subProducts",
              populate: { path: "categoryId", select: "-subCategories" },
            })
            .lean();

          if (multiProduct?.mainProductId) {
            const mainIdStr = multiProduct.mainProductId._id.toString();
            const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);
            const subProductsOnly = (multiProduct.subProducts || [])
              .filter((sub) => sub._id.toString() !== mainIdStr)
              .map(cleanProduct);

            return {
              product: {
                ...cleanedMainProduct,
                subProducts: subProductsOnly,
              },
              cartItemId: item._id,
              addedAt: item.addedAt,
            };
          } else {
            // Single product case
            return {
              product: {
                ...cleanProduct(product),
                subProducts: [],
              },
              cartItemId: item._id,
              addedAt: item.addedAt,
            };
          }
        } else {
          // Multiple productIds: treat as multiProduct set
          // Fetch all products
          const products = await productSchema.find({ _id: { $in: item.productIds } })
            .populate({ path: "categoryId", select: "-subCategories" })
            .lean();

          // Try to find a multiProduct for the first productId
          const multiProduct = await multiProductSchema
            .findOne({
              $or: [
                { mainProductId: { $in: item.productIds } },
                { subProducts: { $in: item.productIds } },
              ],
            })
            .populate({
              path: "mainProductId",
              populate: { path: "categoryId", select: "-subCategories" },
            })
            .populate({
              path: "subProducts",
              populate: { path: "categoryId", select: "-subCategories" },
            })
            .lean();

          if (multiProduct?.mainProductId) {
            const mainIdStr = multiProduct.mainProductId._id.toString();
            const cleanedMainProduct = cleanProduct(multiProduct.mainProductId);
            const subProductsOnly = (multiProduct.subProducts || [])
              .filter((sub) => sub._id.toString() !== mainIdStr)
              .map(cleanProduct);

            return {
              product: {
                ...cleanedMainProduct,
                subProducts: subProductsOnly,
              },
              cartItemId: item._id,
              addedAt: item.addedAt,
            };
          } else {
            // Fallback: return all products as single products
            return {
              product: products.map(cleanProduct),
              cartItemId: item._id,
              addedAt: item.addedAt,
            };
          }
        }
      })
    );
      const cartResponse = {
      _id: cart._id,
      userId: cart.userId,
      cartItems: enhancedCartItems,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt
    };


    return ApiResponse.successResponse(res, 200, "Cart fetched successfully", cartResponse);
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to fetch cart");
  }
};

export const removeCart = async (req, res) => {
  try {
    const { cartId, productId } = req.params;
    console.log(cartId, productId, "removeCart");

    const cart = await Cart.findById(cartId);
    if (!cart) {
      return ApiResponse.errorResponse(res, 404, "Cart not found");
    }


    cart.cartItems = cart.cartItems.filter(item => {
      return !item.productIds.some(id => id.toString() === productId.toString());
    });

    await cart.save();

    return ApiResponse.successResponse(res, 200, "Cart item removed successfully");
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(res, 500, err.message || "Failed to remove cart item");
  }
};


