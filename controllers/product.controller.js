import mongoose from "mongoose";
import categorySchema from "../schemas/category.schema.js";
import productSchema from "../schemas/product.schema.js";
import { ApiResponse } from "../helper/ApiReponse.js"
import { v2 as cloudinary } from "cloudinary";
import userSchema from "../schemas/user.schema.js";
import {isValidObjectId}  from "../helper/isValidId.js"
import multiProductSchema from "../schemas/multiProduct.schema.js";
import productNotificationSchema from "../schemas/productNotification.schema.js";
import requirementSchema from "../schemas/requirement.schema.js";


const mergeDraftProducts = (allDrafts) => {
  const subProductIds = new Set();


  // Step 1: Collect all subproduct IDs
  allDrafts.forEach(product => {
    if (product.subProducts && product.subProducts.length > 0) {
      product.subProducts.forEach(sub => {
        if (sub && sub._id) {
          subProductIds.add(sub._id.toString());
        }
      });
    }
  });

  const merged = [];

  for (const product of allDrafts) {
    if (!product || !product._id) {
      console.warn("Skipping product without _id:", product);
      continue;
    }

    const productId = product._id.toString();

    // Skip if this product is only a subproduct elsewhere (and has no own subs)
    const isSubProductOnly = subProductIds.has(productId) && (!product.subProducts || product.subProducts.length === 0);
    if (isSubProductOnly) continue;

    // If the product has subProducts, ensure it includes itself
    if (product.subProducts && product.subProducts.length > 0) {
      const existingSubs = product.subProducts;

      const isAlreadyIncluded = existingSubs.some(
        sub => sub && sub._id && sub._id.toString() === productId
      );

      const finalSubProducts = isAlreadyIncluded
        ? existingSubs
        : [...existingSubs, product]; // append itself

      merged.push({
        ...product,
        subProducts: finalSubProducts,
      });
    } else {
      // Product has no subProducts – don't add empty subProducts key
      const { subProducts, ...rest } = product;
      merged.push(rest);
    }
  }

  return merged;
};



const processProductData = (productData, imageUrl, documentUrl, categoryId, subCategoryId, userId, draft) => {
  const {
    title,
    quantity,
    minimumBudget,
    productType,
    oldProductValue,
    productCondition,
    description,
    gst_requirement,
    paymentAndDelivery,
    color,
    selectCategory,
    brand,
    additionalDeliveryAndPackage,
    fuelType,
    model,
    transmission,
    productCategory,
    gender,
    typeOfAccessories,
    toolType,
    rateAService,
    conditionOfProduct
  } = productData;

  const isMeaningfulValue = (value) => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (typeof value === 'number' && isNaN(value)) return false;
    return true;
  };

  // Parse JSON fields if they are strings
  let parsedOldProductValue = oldProductValue;
  if (oldProductValue && typeof oldProductValue === "string") {
    try {
      parsedOldProductValue = JSON.parse(oldProductValue);
    } catch (error) {
      parsedOldProductValue = oldProductValue;
    }
  }
  
  let parsedPaymentAndDelivery = paymentAndDelivery;
  if (paymentAndDelivery && typeof paymentAndDelivery === "string") {
    try {
      parsedPaymentAndDelivery = JSON.parse(paymentAndDelivery);
    } catch (error) {
      parsedPaymentAndDelivery = paymentAndDelivery;
    }
  }

  // Build base product object with required fields
  const processedData = {
    draft: draft || false,
    categoryId: new mongoose.Types.ObjectId(categoryId),
    subCategoryId: new mongoose.Types.ObjectId(subCategoryId),
    userId: new mongoose.Types.ObjectId(userId),
  };

  // Only include fields present in productData (req.body), for both draft and non-draft
  // productCondition
  const allowedFields = [
    "title", "quantity", "minimumBudget", "productType", "oldProductValue",
    "description", "gst_requirement", "paymentAndDelivery", "color", "selectCategory", "brand",
    "additionalDeliveryAndPackage", "fuelType", "model", "transmission", "productCategory",
    "gender", "typeOfAccessories", "toolType", "rateAService", "conditionOfProduct", "budget",
    "bidActiveDuration","brandName",'typeOfVehicle','typeOfProduct'
  ];

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(productData, field)) {
      if (field === "title" || field === "description") {
        processedData[field] = typeof productData[field] === "string" ? productData[field].trim() : productData[field];
      } else {
        processedData[field] = productData[field];
      }
    }
  }

  // Handle file uploads
  if (imageUrl) {
    processedData.image = imageUrl;
  }
  if (documentUrl) {
    processedData.document = documentUrl;
  }

  // Handle old product specific fields
  if (
    productData.productType === "old_product" &&
    Object.prototype.hasOwnProperty.call(productData, "oldProductValue")
  ) {
    processedData.oldProductValue = {};
    if (parsedOldProductValue && typeof parsedOldProductValue === "object") {
      if (Object.prototype.hasOwnProperty.call(parsedOldProductValue, "min")) {
        processedData.oldProductValue.min = parsedOldProductValue.min;
      }
      if (Object.prototype.hasOwnProperty.call(parsedOldProductValue, "max")) {
        processedData.oldProductValue.max = parsedOldProductValue.max;
      }
    }
    // if (Object.prototype.hasOwnProperty.call(productData, "productCondition")) {
    //   processedData.productCondition = productData.productCondition;
    // }
  }

  // Handle payment and delivery
  if (Object.prototype.hasOwnProperty.call(productData, "paymentAndDelivery") && parsedPaymentAndDelivery) {
    processedData.paymentAndDelivery = {};
    if (Object.prototype.hasOwnProperty.call(parsedPaymentAndDelivery, "ex_deliveryDate")) {
      processedData.paymentAndDelivery.ex_deliveryDate = parsedPaymentAndDelivery.ex_deliveryDate;
    }
    if (Object.prototype.hasOwnProperty.call(parsedPaymentAndDelivery, "paymentMode")) {
      processedData.paymentAndDelivery.paymentMode = parsedPaymentAndDelivery.paymentMode;
    }
    if (productData.gst_requirement === "yes") {
      if (Object.prototype.hasOwnProperty.call(parsedPaymentAndDelivery, "gstNumber")) {
        processedData.paymentAndDelivery.gstNumber = parsedPaymentAndDelivery.gstNumber;
      }
      if (Object.prototype.hasOwnProperty.call(parsedPaymentAndDelivery, "organizationName")) {
        processedData.paymentAndDelivery.organizationName = parsedPaymentAndDelivery.organizationName;
      }
      if (Object.prototype.hasOwnProperty.call(parsedPaymentAndDelivery, "organizationAddress")) {
        processedData.paymentAndDelivery.organizationAddress = parsedPaymentAndDelivery.organizationAddress;
      }
    }
  }

  return processedData;
};

// Handle single product creation
const handleSingleProduct = async (req, res, { categoryId, subCategoryId, userId }) => {
  let { draft, ...productData } = req.body;
// console.log("productData",productData)
  // Process draft flag
  if (Array.isArray(draft)) {
    draft = draft[draft.length - 1];
  }
  if (typeof draft === "string") {
    draft = draft.toLowerCase() === "true";
  }

  // For non-draft products, validate required fields
  if (!draft) {
    if (!productData.title?.trim() || !productData.description?.trim()) {
      return ApiResponse.errorResponse(res, 400, "Title,  and description are required for non-draft products");
    }
  }

  // Debug: log files for troubleshooting image upload
  console.log("req.files:", req.files);

  // Get files
  const imageFile = req.files?.image?.[0];
  const documentFile = req.files?.document?.[0];
  // For S3, multer-s3 puts the file location in .location
  const imageUrl = imageFile?.location || imageFile?.path || imageFile?.url || null;
  const documentUrl = documentFile?.location || documentFile?.path || documentFile?.url || null;

  // Process product data
  const processedData = processProductData(
    productData, 
    imageUrl, 
    documentUrl,
    categoryId, 
    subCategoryId, 
    userId, 
    draft
  );

  // ✅ Save product
  const newProduct = new productSchema(processedData);
  const savedProduct = await newProduct.save();

  if (!draft) {
    try {
      const newRequirement = new requirementSchema({
        productId: savedProduct._id,
        buyerId: userId,
        sellers: []
      });
      await newRequirement.save();
      console.log("[Requirement] Created requirement for product:", savedProduct._id);
    } catch (err) {
      console.error("[Requirement] Error creating requirement:", err);
    }
  }

  // --- Product Notification Logic (by creator's location) ---
  if (!draft) {
    try {
      // 1. Get creator's location from user collection
      const creator = await userSchema.findById(userId, 'currentLocation');
      const creatorLocation = creator?.currentLocation;
      console.log("[Notification] Creator location:", creatorLocation);

      if (creatorLocation) {
        // 2. Find all users with the same location except the creator
        const usersToNotify = await userSchema.find(
          { currentLocation: creatorLocation, _id: { $ne: userId } },
          '_id'
        );
        console.log("[Notification] Users to notify (excluding creator):", usersToNotify.map(u => u._id.toString()));

        const notifications = [];
        for (const user of usersToNotify) {
          notifications.push({
            userId: user._id,
            productId: savedProduct._id,
            title: processedData.title,
            description: processedData.description,
          });
        }
        if (notifications.length > 0) {
          const result = await productNotificationSchema.insertMany(notifications);
          console.log("[Notification] Notifications inserted into DB:", result.map(n => n._id.toString()));

          // Real-time product notification via socket
          if (global.io && global.userSockets && typeof global.userSockets.get === 'function') {
            for (const user of usersToNotify) {
              const userIdStr = String(user._id);
              const recipientSockets = global.userSockets.get(userIdStr);
              if (recipientSockets) {
                for (const sockId of recipientSockets) {
                  const recipientSocket = global.io.sockets.sockets.get(sockId);
                  if (recipientSocket) {
                    recipientSocket.emit('product_notification', {
                      productId: savedProduct._id,
                      title: processedData.title,
                      description: processedData.description
                    });
                  }
                }
              }
            }
          } else {
            console.warn("[Notification] Skipping socket notification: global.io or global.userSockets not available or not a Map.");
          }
        } else {
          console.log("[Notification] No notifications to insert (no users matched location).");
        }
      } else {
        console.log("[Notification] Creator has no location, skipping notification.");
      }
    } catch (err) {
      console.error("[Notification] Error in notification logic:", err);
    }
  }
  // --- End Product Notification Logic ---

  return ApiResponse.successResponse(
    res,
    201,
    draft ? "Draft product created successfully" : "Product created successfully and added to subCategory",
    savedProduct
  );
};

// Handle multiple products creation
const handleMultipleProducts = async (req, res, { categoryId, subCategoryId, userId }) => {
  try {
    console.log("Starting multiple product processing...");
    const { products, draft, multiProductId } = req.body;
    
    console.log("Raw products data:", products);
    console.log("Draft:", draft);
    console.log("MultiProductId:", multiProductId);
    
    // Parse products if it's a string
    let parsedProducts = products;
    if (typeof products === "string") {
      try {
        parsedProducts = JSON.parse(products);
        console.log("Parsed products:", parsedProducts);
      } catch (error) {
        console.error("JSON parse error:", error);
        return ApiResponse.errorResponse(res, 400, "Invalid products format");
      }
    }
    
    if (!Array.isArray(parsedProducts)) {
      console.error("Products is not an array:", typeof parsedProducts);
      return ApiResponse.errorResponse(res, 400, "Products must be an array");
    }
    
    console.log(`Processing ${parsedProducts.length} products`);
    
    let multiProduct;
    let isNewMultiProduct = false;
    
    // Check if we're adding to an existing multi-product entry
    if (multiProductId && mongoose.Types.ObjectId.isValid(multiProductId)) {
      multiProduct = await multiProductSchema.findById(multiProductId);
      if (!multiProduct) {
        return ApiResponse.errorResponse(res, 404, "Multi-product entry not found");
      }
      
      // Verify ownership
      if (multiProduct.userId.toString() !== userId) {
        return ApiResponse.errorResponse(res, 403, "Not authorized to modify this multi-product entry");
      }
    } else {
      // Create new multi-product entry
      multiProduct = new multiProductSchema({
        userId: new mongoose.Types.ObjectId(userId),
        categoryId: new mongoose.Types.ObjectId(categoryId),
        subCategoryId: new mongoose.Types.ObjectId(subCategoryId),
        draft: draft === "true",
        subProducts: []
      });
      isNewMultiProduct = true;
    }
    
    // Process draft flag
    const isDraft = multiProduct.draft;
    console.log("Is draft:", isDraft);
    
    // Process each product
    const createdProducts = [];
    const imageFiles = req.files?.image || [];
    const documentFiles = req.files?.document || [];

    // Ensure bidActiveDuration is set for each product if provided at top-level
    const globalBidActiveDuration = req.body.bidActiveDuration;
    if (globalBidActiveDuration) {
      for (let i = 0; i < parsedProducts.length; i++) {
        if (
          !Object.prototype.hasOwnProperty.call(parsedProducts[i], "bidActiveDuration") ||
          parsedProducts[i].bidActiveDuration === undefined ||
          parsedProducts[i].bidActiveDuration === null
        ) {
          parsedProducts[i].bidActiveDuration = globalBidActiveDuration;
        }
      }
    }
    
    console.log(`Image files: ${imageFiles.length}, Document files: ${documentFiles.length}`);
    
    // Defensive: Check for excessive product count
    if (parsedProducts.length > 5) {
      console.error("Too many products in request:", parsedProducts.length);
      return ApiResponse.errorResponse(res, 400, "Too many products in request. Please limit to 5 at a time.");
    }
    if (imageFiles.length > parsedProducts.length || documentFiles.length > parsedProducts.length) {
      console.warn("File arrays longer than products array. imageFiles:", imageFiles.length, "documentFiles:", documentFiles.length, "products:", parsedProducts.length);
    }

    for (let i = 0; i < parsedProducts.length; i++) {
      const productData = parsedProducts[i];
      console.log(`Processing product ${i + 1}:`, productData.title);
      
      // For non-draft products, validate required fields
      // || !productData.quantity
      if (!isDraft) {
        if (!productData.title?.trim()  || !productData.description?.trim()) {
          // Clean up any already created products
          for (const product of createdProducts) {
            await productSchema.findByIdAndDelete(product._id);
          }
          if (isNewMultiProduct) {
            await multiProductSchema.findByIdAndDelete(multiProduct._id);
          }
          
          return ApiResponse.errorResponse(res, 400,
            `Product ${i+1}: Title, quantity, and description are required for non-draft products`);
        }
      }
      
      // Debug: log files for troubleshooting image upload
      console.log(`req.files for product ${i + 1}:`, {
        image: imageFiles[i],
        document: documentFiles[i]
      });

      // Get files for this product
      const imageFile = imageFiles[i] || null;
      const documentFile = documentFiles[i] || null;
      // For S3, multer-s3 puts the file location in .location
      const imageUrl = imageFile?.location || imageFile?.path || imageFile?.url || null;
      const documentUrl = documentFile?.location || documentFile?.path || documentFile?.url || null;
      
      console.log(`Product ${i + 1} files - Image: ${imageUrl}, Document: ${documentUrl}`);
      
      // Process product data
      const processedData = processProductData(
        productData,
        imageUrl,
        documentUrl,
        categoryId,
        subCategoryId,
        userId,
        isDraft
      );
      
      console.log(`Processed data for product ${i + 1}:`, processedData);
      
      // Save product
      const newProduct = new productSchema(processedData);
      const savedProduct = await newProduct.save();
      console.log(`Saved product ${i + 1}:`, savedProduct._id);
      createdProducts.push(savedProduct);
      
      // Add to multi-product entry
      multiProduct.subProducts.push(savedProduct._id);
    }
    
    // Set main product ID if this is the first product in the multi-product entry
    if (isNewMultiProduct && createdProducts.length > 0) {
      multiProduct.mainProductId = createdProducts[0]._id;
    }
    
    // Save multi-product entry
    await multiProduct.save();
    console.log("Saved multi-product:", multiProduct._id);
    
    // Only add products to category if not a draft
    if (!isDraft) {
      for (const product of createdProducts) {
        const updatedCategory = await categorySchema.findOneAndUpdate(
          { _id: categoryId, "subCategories._id": subCategoryId },
          { $push: { "subCategories.$.products": product._id } },
          { new: true }
        );
        
        if (!updatedCategory) {
          console.error(`Category or SubCategory not found for product ${product._id}`);
        }
      }
      
      try {
        const requirementDocs = createdProducts.map(product => ({
          productId: product._id,
          buyerId: userId,
          sellers: []
        }));
        
        await requirementSchema.insertMany(requirementDocs);
        console.log("[Requirement][Multiple] Created requirements for", createdProducts.length, "products");
      } catch (err) {
        console.error("[Requirement][Multiple] Error creating requirements:", err);
      }
    
        // --- Product Notification Logic (by creator's location) for multiple products ---
        if (!isDraft && createdProducts.length > 0) {
          try {
            // 1. Get creator's location from user collection
            const creator = await userSchema.findById(userId, 'currentLocation');
            const creatorLocation = creator?.currentLocation;
            console.log("[Notification][Multiple] Creator location:", creatorLocation);
    
            if (creatorLocation) {
              // 2. Find all users with the same location except the creator
              const usersToNotify = await userSchema.find(
                { currentLocation: creatorLocation, _id: { $ne: userId } },
                '_id'
              );
              console.log("[Notification][Multiple] Users to notify (excluding creator):", usersToNotify.map(u => u._id.toString()));
    
              const notifications = [];
              for (const user of usersToNotify) {
                for (const product of createdProducts) {
                  notifications.push({
                    userId: user._id,
                    productId: product._id,
                    title: product.title,
                    description: product.description,
                  });
                }
              }
              if (notifications.length > 0) {
                const result = await productNotificationSchema.insertMany(notifications);
                console.log("[Notification][Multiple] Notifications inserted into DB:", result.map(n => n._id.toString()));
    
                // Real-time product notification via socket
                if (global.io && global.userSockets && typeof global.userSockets.get === 'function') {
                  for (const user of usersToNotify) {
                    const userIdStr = String(user._id);
                    const recipientSockets = global.userSockets.get(userIdStr);
                    if (recipientSockets) {
                      for (const sockId of recipientSockets) {
                        const recipientSocket = global.io.sockets.sockets.get(sockId);
                        if (recipientSocket) {
                          for (const product of createdProducts) {
                            recipientSocket.emit('product_notification', {
                              productId: product._id,
                              title: product.title,
                              description: product.description
                            });
                          }
                        }
                      }
                    }
                  }
                } else {
                  console.warn("[Notification][Multiple] Skipping socket notification: global.io or global.userSockets not available or not a Map.");
                }
              } else {
                console.log("[Notification][Multiple] No notifications to insert (no users matched location).");
              }
            } else {
              console.log("[Notification][Multiple] Creator has no location, skipping notification.");
            }
          } catch (err) {
            console.error("[Notification][Multiple] Error in notification logic:", err);
          }
        }
        // --- End Product Notification Logic ---
    }
    
    return ApiResponse.successResponse(
      res,
      201,
      isDraft
        ? `Draft multi-product created successfully with ${createdProducts.length} products`
        : `Multi-product created successfully with ${createdProducts.length} products added to subCategory`,
      {
        multiProduct,
        products: createdProducts
      }
    );
  } catch (error) {
    console.error("Error in handleMultipleProducts:", error);
    return ApiResponse.errorResponse(res, 500, error.message || "Something went wrong while creating multiple products");
  }
};

// Main add product function
export const addProduct = async (req, res) => {
  const { categoryId, subCategoryId,isMultiple } = req.params;
  const userId = req.user?.userId;
  console.log(req.body,55555)
  console.log(req.params,2234234)
  try {
    // ✅ Validate IDs
    if (!categoryId || !mongoose.Types.ObjectId.isValid(categoryId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing categoryId");
    }
    if (!subCategoryId || !mongoose.Types.ObjectId.isValid(subCategoryId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing subCategoryId");
    }
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing userId");
    }

    // Handle multiple products
    if (isMultiple == "true") {
      return await handleMultipleProducts(req, res, {
        categoryId,
        subCategoryId,
        userId
      });
    }
    
    // Handle single product
    return await handleSingleProduct(req, res, {
      categoryId,
      subCategoryId,
      userId
    });
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      400,
      err.message || "Something went wrong while creating product"
    );
  }
};

export const getMultiProduct = async (req, res) => {
  const { multiProductId } = req.params;
  const userId = req.user?.userId;
  
  try {
    if (!multiProductId || !mongoose.Types.ObjectId.isValid(multiProductId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid or missing multiProductId");
    }
    
    const multiProduct = await MultiProduct.findById(multiProductId)
      .populate('mainProductId')
      .populate('subProducts')
      .populate('userId', 'name email')
      .populate('categoryId', 'name');
    
    if (!multiProduct) {
      return ApiResponse.errorResponse(res, 404, "Multi-product entry not found");
    }
    
    // Verify ownership
    if (multiProduct.userId._id.toString() !== userId) {
      return ApiResponse.errorResponse(res, 403, "Not authorized to access this multi-product entry");
    }
    
    return ApiResponse.successResponse(
      res,
      200,
      "Multi-product retrieved successfully",
      multiProduct
    );
  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      400,
      err.message || "Something went wrong while retrieving multi-product"
    );
  }
};

// export const updateDraftStatus = async (req, res) => {
//   const userId = req.user?.userId;
//   let products;
//   try {
//     if (req.body.products) {
//       try {
//         products = JSON.parse(req.body.products);
//         console.log("Parsed from req.body.products:", products);
//       } catch (e) {
//         console.error("Error parsing req.body.products:", e);
//         return ApiResponse.errorResponse(res, 400, "Invalid products data format");
//       }
//     } else if (Array.isArray(req.body)) {
//       products = req.body;
//       console.log("Parsed from req.body (array root):", products);
//     } else {
//       console.log("req.body is neither products field nor array:", req.body);
//     }
//   } catch (error) {
//     console.error('Error parsing products:', error);
//     return ApiResponse.errorResponse(res, 400, "Invalid products data format");
//   }

//   const draft = false;

//   try {
//     console.log('Parsed products:', products); // Debug log to see parsed data
    
//     // Check if products array is provided
//     if (!Array.isArray(products) || products.length === 0) {
//       return ApiResponse.errorResponse(res, 400, "Products array is required and cannot be empty");
//     }

//     // Extract and validate all product IDs
//     const productIds = products.map(p => p._id).filter(id => id);
    
//     if (productIds.length === 0) {
//       return ApiResponse.errorResponse(res, 400, "No valid product IDs found in products array");
//     }

//     // Validate ObjectIds
//     const invalidIds = productIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
//     if (invalidIds.length > 0) {
//       return ApiResponse.errorResponse(res, 400, `Invalid product IDs: ${invalidIds.join(', ')}`);
//     }

//     const foundProducts = await productSchema.find({ _id: { $in: productIds } });

//     if (foundProducts.length !== productIds.length) {
//       const foundIds = foundProducts.map(p => p._id.toString());
//       const missingIds = productIds.filter(id => !foundIds.includes(id));
//       return ApiResponse.errorResponse(res, 404, `Products not found: ${missingIds.join(', ')}`);
//     }

//     // Verify ownership for all products
//     const unauthorizedProducts = foundProducts.filter(fp => 
//       fp.userId && fp.userId.toString() !== userId
//     );
    
//     if (unauthorizedProducts.length > 0) {
//       const unauthorizedIds = unauthorizedProducts.map(p => p._id.toString());
//       return ApiResponse.errorResponse(res, 403, `Not authorized to modify products: ${unauthorizedIds.join(', ')}`);
//     }

//     // Create a map of product updates for easier access
//     const productUpdatesMap = new Map();
//     products.forEach(product => {
//       if (product._id) {
//         const { _id, ...productFields } = product;

//         // Parse paymentAndDelivery if it's a string
//         if (typeof productFields.paymentAndDelivery === "string") {
//           try {
//             productFields.paymentAndDelivery = JSON.parse(productFields.paymentAndDelivery);
//           } catch (e) {
//             // leave as string if parsing fails
//           }
//         }

//         productUpdatesMap.set(_id, productFields);
//       }
//     });

//     const imageFiles = req.files?.image || [];
// const documentFiles = req.files?.document || [];

//     // Perform bulk updates
//     const updatedProducts = await Promise.all(
//       products.map(async (product, idx) => {
//         const productId = product._id;
//         const specificProductFields = productUpdatesMap.get(productId) || {};

//         // Handle image upload (match by index: image_0, image_1, etc.)
//         let imageUrl = null;
//         if (req.files && req.files[`image_${idx}`] && req.files[`image_${idx}`][0]) {
//           imageUrl = req.files[`image_${idx}`][0].path || req.files[`image_${idx}`][0].url || null;
//         } else if (req.files && req.files.image && Array.isArray(req.files.image) && req.files.image[idx]) {
//           imageUrl = req.files.image[idx].path || req.files.image[idx].url || null;
//         }

//          // Handle document upload (match by index: document_0, document_1, etc.)
//     let documentUrl = null;
//     if (req.files && req.files[`document_${idx}`] && req.files[`document_${idx}`][0]) {
//       documentUrl = req.files[`document_${idx}`][0].path || req.files[`document_${idx}`][0].url || null;
//     } else if (req.files && req.files.document && Array.isArray(req.files.document) && req.files.document[idx]) {
//       documentUrl = req.files.document[idx].path || req.files.document[idx].url || null;
//     }

//         // Combine with draft status (always false) and image if present
//         const updatePayload = {
//           ...specificProductFields,
//           draft
//         };
//         if (imageUrl) updatePayload.image = imageUrl;
//         if (documentUrl) updatePayload.document = documentUrl;

//         console.log(`Updating product ${productId} with:`, updatePayload);

//         const updateResult = await productSchema.updateOne(
//           { _id: productId },
//           updatePayload
//         );
//         console.log(`Update result for ${productId}:`, updateResult);

//         // Re-fetch the updated product to ensure fresh data
//         const updatedDoc = await productSchema.findById(productId);
//         console.log(`Updated product ${productId}:`, updatedDoc);
//         return updatedDoc;
//       })
//     );

//     return ApiResponse.successResponse(
//       res,
//       200,
//       `${updatedProducts.length} product(s) published successfully`,
//       updatedProducts
//     );

//   } catch (err) {
//     console.error(err);
//     return ApiResponse.errorResponse(
//       res,
//       500,
//       err.message || "Something went wrong while updating draft status"
//     );
//   }
// };

export const updateDraftStatus = async (req, res) => {
  const userId = req.user?.userId;
  let products;
  try {
    if (req.body.products) {
      try {
        products = JSON.parse(req.body.products);
        console.log("Parsed from req.body.products:", products);
      } catch (e) {
        console.error("Error parsing req.body.products:", e);
        return ApiResponse.errorResponse(res, 400, "Invalid products data format");
      }
    } else if (Array.isArray(req.body)) {
      products = req.body;
      console.log("Parsed from req.body (array root):", products);
    } else {
      console.log("req.body is neither products field nor array:", req.body);
    }
  } catch (error) {
    console.error('Error parsing products:', error);
    return ApiResponse.errorResponse(res, 400, "Invalid products data format");
  }

  const draft = false;

  try {
    console.log('Parsed products:', products);
    
    if (!Array.isArray(products) || products.length === 0) {
      return ApiResponse.errorResponse(res, 400, "Products array is required and cannot be empty");
    }

    const productIds = products.map(p => p._id).filter(id => id);
    
    if (productIds.length === 0) {
      return ApiResponse.errorResponse(res, 400, "No valid product IDs found in products array");
    }

    const invalidIds = productIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return ApiResponse.errorResponse(res, 400, `Invalid product IDs: ${invalidIds.join(', ')}`);
    }

    const foundProducts = await productSchema.find({ _id: { $in: productIds } });

    if (foundProducts.length !== productIds.length) {
      const foundIds = foundProducts.map(p => p._id.toString());
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      return ApiResponse.errorResponse(res, 404, `Products not found: ${missingIds.join(', ')}`);
    }

    const unauthorizedProducts = foundProducts.filter(fp => 
      fp.userId && fp.userId.toString() !== userId
    );
    
    if (unauthorizedProducts.length > 0) {
      const unauthorizedIds = unauthorizedProducts.map(p => p._id.toString());
      return ApiResponse.errorResponse(res, 403, `Not authorized to modify products: ${unauthorizedIds.join(', ')}`);
    }

    const productUpdatesMap = new Map();
    products.forEach(product => {
      if (product._id) {
        const { _id, ...productFields } = product;

        if (typeof productFields.paymentAndDelivery === "string") {
          try {
            productFields.paymentAndDelivery = JSON.parse(productFields.paymentAndDelivery);
          } catch (e) {
            // leave as string if parsing fails
          }
        }

        productUpdatesMap.set(_id, productFields);
      }
    });

    const imageFiles = req.files?.image || [];
    const documentFiles = req.files?.document || [];

    const updatedProducts = await Promise.all(
      products.map(async (product, idx) => {
        const productId = product._id;
        const specificProductFields = productUpdatesMap.get(productId) || {};

        let imageUrl = null;
        if (req.files && req.files[`image_${idx}`] && req.files[`image_${idx}`][0]) {
          imageUrl = req.files[`image_${idx}`][0].path || req.files[`image_${idx}`][0].url || null;
        } else if (req.files && req.files.image && Array.isArray(req.files.image) && req.files.image[idx]) {
          imageUrl = req.files.image[idx].path || req.files.image[idx].url || null;
        }

        let documentUrl = null;
        if (req.files && req.files[`document_${idx}`] && req.files[`document_${idx}`][0]) {
          documentUrl = req.files[`document_${idx}`][0].path || req.files[`document_${idx}`][0].url || null;
        } else if (req.files && req.files.document && Array.isArray(req.files.document) && req.files.document[idx]) {
          documentUrl = req.files.document[idx].path || req.files.document[idx].url || null;
        }

        const updatePayload = {
          ...specificProductFields,
          draft
        };
        if (imageUrl) updatePayload.image = imageUrl;
        if (documentUrl) updatePayload.document = documentUrl;

        console.log(`Updating product ${productId} with:`, updatePayload);

        const updateResult = await productSchema.updateOne(
          { _id: productId },
          updatePayload
        );
        console.log(`Update result for ${productId}:`, updateResult);

        const updatedDoc = await productSchema.findById(productId);
        console.log(`Updated product ${productId}:`, updatedDoc);
        return updatedDoc;
      })
    );


    try {
      const requirementDocs = updatedProducts.map(product => ({
        productId: product._id,
        buyerId: userId,
        sellers: []
      }));
      
      await requirementSchema.insertMany(requirementDocs);
      console.log("[Requirement] Created requirements for", updatedProducts.length, "products");
    } catch (err) {
      console.error("[Requirement] Error creating requirements:", err);
    }


    try {
      const creator = await userSchema.findById(userId, 'currentLocation');
      const creatorLocation = creator?.currentLocation;
      console.log("[Notification] Creator location:", creatorLocation);

      if (creatorLocation) {
        const usersToNotify = await userSchema.find(
          { currentLocation: creatorLocation, _id: { $ne: userId } },
          '_id'
        );
        console.log("[Notification] Users to notify (excluding creator):", usersToNotify.map(u => u._id.toString()));

        const notifications = [];
        for (const user of usersToNotify) {
          for (const product of updatedProducts) {
            notifications.push({
              userId: user._id,
              productId: product._id,
              title: product.title,
              description: product.description,
            });
          }
        }
        
        if (notifications.length > 0) {
          const result = await productNotificationSchema.insertMany(notifications);
          console.log("[Notification] Notifications inserted into DB:", result.map(n => n._id.toString()));

          // Real-time product notification via socket
          if (global.io && global.userSockets && typeof global.userSockets.get === 'function') {
            for (const user of usersToNotify) {
              const userIdStr = String(user._id);
              const recipientSockets = global.userSockets.get(userIdStr);
              if (recipientSockets) {
                for (const sockId of recipientSockets) {
                  const recipientSocket = global.io.sockets.sockets.get(sockId);
                  if (recipientSocket) {
                    for (const product of updatedProducts) {
                      recipientSocket.emit('product_notification', {
                        productId: product._id,
                        title: product.title,
                        description: product.description
                      });
                    }
                  }
                }
              }
            }
          } else {
            console.warn("[Notification] Skipping socket notification: global.io or global.userSockets not available or not a Map.");
          }
        } else {
          console.log("[Notification] No notifications to insert (no users matched location).");
        }
      } else {
        console.log("[Notification] Creator has no location, skipping notification.");
      }
    } catch (err) {
      console.error("[Notification] Error in notification logic:", err);
    }

    return ApiResponse.successResponse(
      res,
      200,
      `${updatedProducts.length} product(s) published successfully`,
      updatedProducts
    );

  } catch (err) {
    console.error(err);
    return ApiResponse.errorResponse(
      res,
      500,
      err.message || "Something went wrong while updating draft status"
    );
  }
};

export const getProducts = async (req, res) => {
    try {
        const { categoryId, subCategoryId } = req.params
        const { skip = 0, limit = 10 } = req.query; 
        const skipValue = parseInt(skip, 10);
        const limitValue = parseInt(limit, 10);

        let filter = {draft: false};

        if (subCategoryId) {
            const category = await categorySchema.findOne({ "subCategories._id": subCategoryId });
            if (!category) return ApiResponse.errorResponse(res, 404, "Subcategory not found");

            const subCategory = category.subCategories.id(subCategoryId);
            filter._id = { $in: subCategory.products };
        } else if (categoryId) {
            const category = await categorySchema.findById(categoryId);
            if (!category) return ApiResponse.errorResponse(res, 404, "Category not found");

            const productIds = category.subCategories.reduce((acc, sub) => acc.concat(sub.products), []);
            filter._id = { $in: productIds };
        }

        const total = await productSchema.countDocuments(filter);
        // Apply skip & limit for pagination
        const products = await productSchema.find(filter).skip(skipValue).limit(limitValue)

        return ApiResponse.successResponse(res, 200, "Products fetched successfully", { total, products });
    } catch (error) {
        return ApiResponse.errorResponse(res, 500, error.message);
    }
};


export const searchProductsController = async (req, res) => {
  try {
    // Accept both 'category' and 'categoryId' as query params
    const { title, category, categoryId, sort, min_budget, max_budget, page = 1, limit = 10, skip } = req.query;

    const limitValue = Math.max(parseInt(limit, 10), 1);
    const pageValue = Math.max(parseInt(page, 10), 1);
    const skipValue = skip ? parseInt(skip, 10) : (pageValue - 1) * limitValue;

    let filter = { draft: false };
    let useTitleSearch = true;

    // If category or categoryId is present, ignore title and search by categoryId only
    const catId = category || categoryId;
    const subCatId = req.query.subCategoryId;
    if (catId) {
      if (!mongoose.Types.ObjectId.isValid(catId)) {
        return ApiResponse.errorResponse(res, 400, "Invalid categoryId");
      }
      filter.categoryId = new mongoose.Types.ObjectId(catId);
      useTitleSearch = false;
    }
    if (subCatId) {
      if (!mongoose.Types.ObjectId.isValid(subCatId)) {
        return ApiResponse.errorResponse(res, 400, "Invalid subCategoryId");
      }
      filter.subCategoryId = new mongoose.Types.ObjectId(subCatId);
      useTitleSearch = false;
    }

    // If not searching by category, require title
    if (useTitleSearch) {
      if (!title || typeof title !== "string" || title.trim().length < 2) {
        return ApiResponse.errorResponse(res, 400, "Valid product title is required (min 2 characters)");
      }
      const words = title.trim().split(/\s+/);

      // Strong filter: all words as whole words
      const strongFilter = {
        ...filter,
        $and: words.map((word) => ({
          title: { $regex: `\\b${word}\\b`, $options: "i" },
        })),
      };

      // Weak filter: any word as substring
      const weakFilter = {
        ...filter,
        $or: words.map((word) => ({
          title: { $regex: word, $options: "i" },
        })),
      };

      // Budget filter (applies to both strong/weak)
      if (min_budget || max_budget) {
        const budgetCond = {};
        if (min_budget) budgetCond.$gte = Number(min_budget);
        if (max_budget) budgetCond.$lte = Number(max_budget);
        // budget is string in schema, so use $expr to cast
        strongFilter.$expr = {
          $and: [
            ...(min_budget ? [{ $gte: [{ $toDouble: "$budget" }, Number(min_budget)] }] : []),
            ...(max_budget ? [{ $lte: [{ $toDouble: "$budget" }, Number(max_budget)] }] : []),
          ],
        };
        weakFilter.$expr = strongFilter.$expr;
      }

      // Sorting
      let sortObj = { createdAt: -1 }; // default: newly_added
      if (sort) {
        switch (sort) {
          case "feature":
            sortObj = { feature: -1, createdAt: -1 }; // assuming 'feature' field exists
            break;
          case "aplhabetically_a_z":
            sortObj = { title: 1 };
            break;
          case "aplhabetically_z_a":
            sortObj = { title: -1 };
            break;
          case "low_to_high":
            sortObj = { $expr: { $toDouble: "$budget" } }; // handled below
            break;
          case "high_to_low":
            sortObj = { $expr: { $toDouble: "$budget" } }; // handled below
            break;
          default:
            sortObj = { createdAt: -1 };
        }
      }

      // Query with strong filter first
      let products = await productSchema.find(strongFilter)
        .skip(skipValue)
        .limit(limitValue)
        .populate({ path: 'userId', select: "firstName lastName address" })
        .populate({ path: 'categoryId', select: 'categoryName' })
        .sort(
          sort === "low_to_high"
            ? { $expr: { $toDouble: "$budget" } }
            : sort === "high_to_low"
            ? { $expr: { $toDouble: "$budget" } }
            : sortObj
        );

      let total = await productSchema.countDocuments(strongFilter);

      // If no products, try weak filter
      if (products.length === 0) {
        products = await productSchema.find(weakFilter)
          .skip(skipValue)
          .limit(limitValue)
          .populate({ path: 'userId', select: "firstName lastName address" })
          .populate({ path: 'categoryId', select: 'categoryName' })
          .sort(
            sort === "low_to_high"
              ? { $expr: { $toDouble: "$budget" } }
              : sort === "high_to_low"
              ? { $expr: { $toDouble: "$budget" } }
              : sortObj
          );
        total = await productSchema.countDocuments(weakFilter);
      }

      // For price sort, sort in-memory if needed (since $expr sort not supported in .sort)
      if (sort === "low_to_high" || sort === "high_to_low") {
        products = products.sort((a, b) => {
          const aBudget = Number(a.budget) || 0;
          const bBudget = Number(b.budget) || 0;
          return sort === "low_to_high" ? aBudget - bBudget : bBudget - aBudget;
        });
      }

      return ApiResponse.successResponse(res, 200, "Products fetched successfully", {
        total,
        totalPages: Math.ceil(total / limitValue),
        page: pageValue,
        limit: limitValue,
        skip: skipValue,
        products,
      });
    } else {
      // Category search (ignore title)
      // Budget filter
      if (min_budget || max_budget) {
        filter.$expr = {
          $and: [
            ...(min_budget ? [{ $gte: [{ $toDouble: "$budget" }, Number(min_budget)] }] : []),
            ...(max_budget ? [{ $lte: [{ $toDouble: "$budget" }, Number(max_budget)] }] : []),
          ],
        };
      }

      // Sorting
      let sortObj = { createdAt: -1 }; // default: newly_added
      if (sort) {
        switch (sort) {
          case "feature":
            sortObj = { feature: -1, createdAt: -1 }; // assuming 'feature' field exists
            break;
          case "aplhabetically_a_z":
            sortObj = { title: 1 };
            break;
          case "aplhabetically_z_a":
            sortObj = { title: -1 };
            break;
          case "low_to_high":
            sortObj = {}; // handled below
            break;
          case "high_to_low":
            sortObj = {}; // handled below
            break;
          default:
            sortObj = { createdAt: -1 };
        }
      }

      let products = await productSchema.find(filter)
        .skip(skipValue)
        .limit(limitValue)
        .populate({ path: 'userId', select: "firstName lastName address" })
        .populate({ path: 'categoryId', select: 'categoryName' })
        .sort(
          sort === "low_to_high"
            ? {}
            : sort === "high_to_low"
            ? {}
            : sortObj
        );

      let total = await productSchema.countDocuments(filter);

      // For price sort, sort in-memory if needed
      if (sort === "low_to_high" || sort === "high_to_low") {
        products = products.sort((a, b) => {
          const aBudget = Number(a.budget) || 0;
          const bBudget = Number(b.budget) || 0;
          return sort === "low_to_high" ? aBudget - bBudget : bBudget - aBudget;
        });
      }

      return ApiResponse.successResponse(res, 200, "Products fetched successfully", {
        total,
        totalPages: Math.ceil(total / limitValue),
        page: pageValue,
        limit: limitValue,
        skip: skipValue,
        products,
      });
    }
  } catch (error) {
    console.error("Error in searchProductsController:", error);
    return ApiResponse.errorResponse(res, 500, "Internal server error");
  }
};

export const updateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid product ID");
    }

    const imageFile = req.files?.image?.[0];
    const documentFile = req.files?.document?.[0];
    const imageUrl = imageFile?.path || imageFile?.url || null;
    const documentUrl = documentFile?.path || documentFile?.url || null;

    const {
      title,
      quantity,
      minimumBudget,
      productType,
      oldProductValue,
      productCondition,
      description,
      draft,
      gst_requirement,
      paymentAndDelivery,
      color,
      selectCategory,
      brand,
      additionalDeliveryAndPackage,
      fuelType,
      model,
      transmission,
      productCategory,
      gender,
      typeOfAccessories,
      constructionToolType,
      toolType,
      rateAService,
    } = req.body;

    const updateData = {
      ...(title?.trim() && { title: title.trim() }),
      ...(quantity && { quantity }),
      ...(minimumBudget && { minimumBudget }),
      ...(productType && { productType }),
      ...(description?.trim() && { description: description.trim() }),
      ...(draft !== undefined && { draft }),
      ...(imageUrl && { image: imageUrl }),
      ...(documentUrl && { document: documentUrl }),
      ...(color && { color }),
      ...(selectCategory && { selectCategory }),
      ...(brand && { brand }),
      ...(additionalDeliveryAndPackage && { additionalDeliveryAndPackage }),
      ...(fuelType && { fuelType }),
      ...(model && { model }),
      ...(transmission && { transmission }),
      ...(productCategory && { productCategory }),
      ...(gender && { gender }),
      ...(typeOfAccessories && { typeOfAccessories }),
      ...(constructionToolType && { constructionToolType }),
      ...(toolType && { toolType }),
      ...(rateAService && { rateAService }),
    };

    if (productType === "old_product") {
      if (oldProductValue?.min || oldProductValue?.max) {
        updateData.oldProductValue = {
          ...(oldProductValue?.min && { min: oldProductValue.min }),
          ...(oldProductValue?.max && { max: oldProductValue.max }),
        };
      }
      // if (productCondition) {
      //   updateData.productCondition = productCondition;
      // }
    }

    if (paymentAndDelivery || gst_requirement === "yes") {
      updateData.paymentAndDelivery = {
        ...(paymentAndDelivery?.ex_deliveryDate && { ex_deliveryDate: paymentAndDelivery.ex_deliveryDate }),
        ...(paymentAndDelivery?.paymentMode && { paymentMode: paymentAndDelivery.paymentMode }),
        ...(gst_requirement === "yes" && paymentAndDelivery?.gstNumber && { gstNumber: paymentAndDelivery.gstNumber }),
        ...(gst_requirement === "yes" && paymentAndDelivery?.organizationName && { organizationName: paymentAndDelivery.organizationName }),
        ...(gst_requirement === "yes" && paymentAndDelivery?.organizationAddress && { organizationAddress: paymentAndDelivery.organizationAddress }),
      };
    }

    const updatedProduct = await productSchema.findByIdAndUpdate(productId, updateData, { new: true });
    if (!updatedProduct) {
      return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    return ApiResponse.successResponse(res, 200, "Product updated successfully", updatedProduct);
  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(res, 500, error.message || "Something went wrong while updating product");
  }
};

export const deleteProduct = async (req, res) => {
    try {
        const { productId } = req.params;
        const { categoryId, subCategoryId } = req.body;

        if (!isValidObjectId(productId)) return ApiResponse.errorResponse(res, 400, "Invalid product ID");

        const product = await productSchema.findByIdAndDelete(productId);
        if (!product) return ApiResponse.errorResponse(res, 404, "Product not found");

        if (categoryId && subCategoryId) {
            const category = await categorySchema.findById(categoryId);
            if (category) {
                const subCategory = category.subCategories.id(subCategoryId);
                if (subCategory) {
                    subCategory.products.pull(productId);
                    await category.save();
                }
            }
        }

        return ApiResponse.successResponse(res, 200, "Product deleted successfully");
    } catch (error) {
        return ApiResponse.errorResponse(res, 500, error.message);
    }
};

export const getProductByName = async (req, res) => {
  try {
    const { productName } = req.params;
        if (!productName) return ApiResponse.successResponse(res, 200,'empty query',[]);
    const products = await productSchema.find({
      title: { $regex: productName, $options: "i"},      draft:false  
    },{
        title:1,
        image:1,
        description:1
      }).populate({
      path:'userId',
      select:"firstName lastName address"
    }).populate({
      path:'categoryId',
      select:'categoryName'
    }).limit(5).lean()
    return ApiResponse.successResponse(res, 200,'products found',products);
  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(res, 400, error.message,null);
  }
};

// Get product by ID
export const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!isValidObjectId(productId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid product ID");
    }

    // 1. Find the product
    let product = await productSchema.findById(productId)
      .populate({ path: "userId", select: "firstName lastName address" })
      .populate({ path: "categoryId", select: "categoryName" });

    if (!product) {
      return ApiResponse.errorResponse(res, 404, "Product not found");
    }

    // 2. Check if product is part of any MultiProduct
    const multiProduct = await multiProductSchema
      .findOne({
        $or: [
          { mainProductId: product._id },
          { subProducts: product._id }
        ]
      })
      .populate({
        path: "mainProductId",
        populate: [
          { path: "userId", select: "firstName lastName address" },
          { path: "categoryId", select: "categoryName" }
        ]
      })
      .populate({
        path: "subProducts",
        populate: [
          { path: "userId", select: "firstName lastName address" },
          { path: "categoryId", select: "categoryName" }
        ]
      });

    if (multiProduct && multiProduct.mainProductId) {
      const mainProduct = multiProduct.mainProductId.toObject();
      const subProducts = (multiProduct.subProducts || []).map(sp =>
        sp.toObject ? sp.toObject() : sp
      );

      return ApiResponse.successResponse(res, 200, "Product found", [
        { mainProduct, subProducts }
      ]);
    }

    // If not part of MultiProduct
    return ApiResponse.successResponse(res, 200, "Product found", [
      { mainProduct: product.toObject(), subProducts: [] }
    ]);

  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(res, 500, error.message);
  }
};




export const getDraftProducts = async (req, res) => {
  try {
      const userId = req.user._id;
      const { skip = 0, limit = 10 } = req.query;
      const skipValue = parseInt(skip, 10);
      const limitValue = parseInt(limit, 10);

      let filter = { draft: true, userId };
      console.log("Draft fetch filter:", filter);

      const total = await productSchema.countDocuments(filter);
      const products = await productSchema.find(filter).skip(skipValue).limit(limitValue);
      console.log("Draft fetch result:", products);

      return ApiResponse.successResponse(res, 200, "Draft products fetched successfully", { total, products });
  } catch (error) {
      return ApiResponse.errorResponse(res, 500, error.message);
  }
};

export const getAllDraftProducts = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    if (!userId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }

    // Extract pagination parameters from query or use defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch all draft products for the user
    const draftProducts = await productSchema.find({
      draft: true,
      userId: userId
    }).populate("categoryId");

    const multiProducts = await multiProductSchema.find({
      $or: [
        { mainProductId: { $in: draftProducts.map(p => p._id) } },
        { subProducts: { $in: draftProducts.map(p => p._id) } }
      ]
    })
    .populate({
      path: "mainProductId",
      populate: { path: "categoryId" }
    })
    .populate({
      path: "subProducts",
      populate: { path: "categoryId" }
    });

    function cleanProduct(prod) {
      if (!prod) return prod;
      let p = prod.toObject ? prod.toObject() : { ...prod };

      if (p.__v !== undefined) delete p.__v;

      if (p.categoryId && p.categoryId.subCategories) {
        p.categoryId = {
          _id: p.categoryId._id,
          categoryName: p.categoryId.categoryName,
          image: p.categoryId.image,
          updatedAt: p.categoryId.updatedAt
        };
      }
      
      return p;
    }

    const processedProducts = new Set();
    const result = [];

    for (const multiProduct of multiProducts) {
      if (multiProduct.mainProductId) {
        const mainId = multiProduct.mainProductId._id.toString();

        if (processedProducts.has(mainId)) continue;
        
        processedProducts.add(mainId);
        
        const cleanedMain = cleanProduct(multiProduct.mainProductId);

        const subProductsOnly = (multiProduct.subProducts || [])
          .filter(sub => sub._id.toString() !== mainId)
          .map(cleanProduct);
        
        result.push({
          ...cleanedMain,
          subProducts: subProductsOnly
        });

        subProductsOnly.forEach(sub => {
          processedProducts.add(sub._id.toString());
        });
      }
    }

    for (const product of draftProducts) {
      const productId = product._id.toString();
      if (!processedProducts.has(productId)) {
        result.push({
          ...cleanProduct(product),
          subProducts: []
        });
        processedProducts.add(productId);
      }
    }

    // Apply pagination to the final result array
    const total = result.length;
    const paginatedResult = result.slice(skip, skip + limit);

    return ApiResponse.successResponse(
      res,
      200,
      "Draft products fetched successfully",
      {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        data: paginatedResult
      }
    );
  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(
      res,
      500,
      error.message || "Failed to fetch draft products"
    );
  }
};


export const getDraftProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user?._id || req.user?.userId;
    
    if (!userId) {
      return ApiResponse.errorResponse(res, 400, "User not authenticated");
    }
    
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return ApiResponse.errorResponse(res, 400, "Invalid product ID");
    }
    
    const objectProductId = new mongoose.Types.ObjectId(productId);

    const singleDraft = await productSchema.aggregate([
      {
        $match: {
          _id: objectProductId,
          draft: true,
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryId",
        },
      },
      {
        $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true },
      },
    ]);

    const multiDraft = await multiProductSchema.aggregate([
      {
        $match: {
          mainProductId: objectProductId,
          draft: true,
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "mainProductId",
          foreignField: "_id",
          as: "mainProduct",
        },
      },
      { $unwind: { path: "$mainProduct", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "products",
          localField: "subProducts",
          foreignField: "_id",
          as: "subProductsDetails",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "subProductsDetails.categoryId",
          foreignField: "_id",
          as: "subProductCategories",
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryId",
        },
      },
      { $unwind: { path: "$categoryId", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: "$mainProduct._id",
          draft: 1,
          createdAt: "$mainProduct.createdAt",
          updatedAt: "$mainProduct.updatedAt",
          title: "$mainProduct.title",
          quantity: "$mainProduct.quantity",
          image: "$mainProduct.image",
          minimumBudget: "$mainProduct.minimumBudget",
          productType: "$mainProduct.productType",
          description: "$mainProduct.description",
          categoryId: "$categoryId",
          subCategoryId: "$mainProduct.subCategoryId",
          userId: "$mainProduct.userId",
          brand: "$mainProduct.brand",
          paymentAndDelivery: "$mainProduct.paymentAndDelivery",
          totalBidCount: "$mainProduct.totalBidCount",
          subProducts: {
            $map: {
              input: "$subProductsDetails",
              as: "subProduct",
              in: {
                $mergeObjects: [
                  "$$subProduct",
                  {
                    categoryId: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: "$subProductCategories",
                            cond: {
                              $eq: ["$$this._id", "$$subProduct.categoryId"]
                            }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
    ]);

    // If found as multi-product, apply the same logic as getAllDraftProducts
    if (multiDraft.length > 0) {
      const product = multiDraft[0];
      
      // Apply the mergeDraftProducts logic for single product
      const allDrafts = [product];
      const merged = mergeDraftProducts(allDrafts);
      
      return ApiResponse.successResponse(
        res,
        200,
        "Draft product fetched successfully",
        merged[0]
      );
    }

    // If found as single draft, return without subProducts array
    if (singleDraft.length > 0) {
      const product = singleDraft[0];
      return ApiResponse.successResponse(
        res,
        200,
        "Draft product fetched successfully",
        product
      );
    }

    return ApiResponse.errorResponse(res, 404, "Draft product not found");
    
  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(
      res,
      500,
      error.message || "Failed to fetch draft product"
    );
  }
};

export const getUnseenProductNotifications = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    if (!userId) {
      return ApiResponse.errorResponse(res, 401, "User not authenticated");
    }
    const notifications = await productNotificationSchema.find({
      userId,
      seen: false
    }).sort({ createdAt: -1 });
    return ApiResponse.successResponse(res, 200, "Unseen product notifications fetched", notifications);
  } catch (error) {
    return ApiResponse.errorResponse(res, 500, error.message || "Failed to fetch notifications");
  }
};

export const markProductNotificationSeen = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    const { notificationId, notificationIds } = req.body;
    
    if (!userId) {
      return ApiResponse.errorResponse(res, 401, "User not authenticated");
    }
    
    // Handle multiple notifications
    if (notificationIds && Array.isArray(notificationIds)) {
      if (notificationIds.length === 0) {
        return ApiResponse.errorResponse(res, 400, "Notification IDs array cannot be empty");
      }
      
      const result = await productNotificationSchema.updateMany(
        { _id: { $in: notificationIds }, userId },
        { $set: { seen: true } }
      );
      
      if (result.matchedCount === 0) {
        return ApiResponse.errorResponse(res, 404, "No notifications found");
      }
      
      return ApiResponse.successResponse(
        res, 
        200, 
        `${result.modifiedCount} notification(s) marked as seen`,
        { modifiedCount: result.modifiedCount, matchedCount: result.matchedCount }
      );
    }
    
    // Handle single notification
    if (!notificationId) {
      return ApiResponse.errorResponse(res, 400, "Notification ID or IDs array is required");
    }
    
    const notification = await productNotificationSchema.findOneAndUpdate(
      { _id: notificationId, userId },
      { $set: { seen: true } },
      { new: true }
    );
    
    if (!notification) {
      return ApiResponse.errorResponse(res, 404, "Notification not found");
    }
    
    return ApiResponse.successResponse(res, 200, "Notification marked as seen", notification);
  } catch (error) {
    return ApiResponse.errorResponse(res, 500, error.message || "Failed to mark notification as seen");
  }
};

export const deleteProductNotification = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.userId;
    const { notificationId } = req.params;
    if (!userId) {
      return ApiResponse.errorResponse(res, 401, "User not authenticated");
    }
    if (!notificationId) {
      return ApiResponse.errorResponse(res, 400, "Notification ID is required");
    }
    const notification = await productNotificationSchema.findOneAndDelete(
      { _id: notificationId, userId }
    );
    if (!notification) {
      return ApiResponse.errorResponse(res, 404, "Notification not found");
    }
    return ApiResponse.successResponse(res, 200, "Notification deleted successfully", notification);
  } catch (error) {
    return ApiResponse.errorResponse(res, 500, error.message || "Failed to delete notification");
  }
};

export const getHomeProducts = async (req, res) => {
  try {
    // Step 1: Get top 2 categories by product count
    const topCategories = await productSchema.aggregate([
      { $match: { draft: false } },
      {
        $group: {
          _id: '$categoryId',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 2 }
    ]);

    const topCategoryIds = topCategories.map(c => c._id);

    // Step 2: Fetch up to 3 products per category with populated categoryInfo and userInfo
    const topProductsPerCategory = await productSchema.aggregate([
      {
        $match: {
          categoryId: { $in: topCategoryIds },
          draft: false
        }
      },
      // Populate category info
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },

      // Populate user info
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },

      // Group products by category
      {
        $group: {
          _id: '$categoryId',
          categoryName: { $first: '$categoryInfo.categoryName' },
          products: { $push: '$$ROOT' }
        }
      },
      // Slice products to limit 3 per category
      {
        $project: {
          _id: 1,
          categoryName: 1,
          products: { $slice: ['$products', 3] }
        }
      }
    ]);

    // Send response
    return ApiResponse.successResponse(res, 200, 'Products fetched successfully', topProductsPerCategory);

  } catch (error) {
    console.error(error);
    return ApiResponse.errorResponse(res, 500, error.message || 'Failed to fetch products');
  }
};
export const saveAsDraft = async (req, res) => {
  const userId = req.user?.userId;
  let products;
  let fileMapping;
  
  try {
    if (req.body.products) {
      try {
        products = JSON.parse(req.body.products);
        console.log("Parsed products:", products);
      } catch (e) {
        console.error("Error parsing req.body.products:", e);
        return ApiResponse.errorResponse(res, 400, "Invalid products data format");
      }
    } else if (Array.isArray(req.body)) {
      products = req.body;
    } else {
      return ApiResponse.errorResponse(res, 400, "Products data is required");
    }

    // Parse file mapping
    if (req.body.fileMapping) {
      try {
        fileMapping = JSON.parse(req.body.fileMapping);
        console.log("File mapping:", fileMapping);
      } catch (e) {
        console.error("Error parsing fileMapping:", e);
      }
    }

    if (!Array.isArray(products) || products.length === 0) {
      return ApiResponse.errorResponse(res, 400, "Products array is required and cannot be empty");
    }

    const productIds = products.map(p => p._id).filter(id => id);
    
    if (productIds.length === 0) {
      return ApiResponse.errorResponse(res, 400, "No valid product IDs found in products array");
    }

    // Validate ObjectIds
    const invalidIds = productIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return ApiResponse.errorResponse(res, 400, `Invalid product IDs: ${invalidIds.join(', ')}`);
    }

    // Find all products
    const foundProducts = await productSchema.find({ _id: { $in: productIds } });

    if (foundProducts.length !== productIds.length) {
      const foundIds = foundProducts.map(p => p._id.toString());
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      return ApiResponse.errorResponse(res, 404, `Products not found: ${missingIds.join(', ')}`);
    }

    // Check authorization
    const unauthorizedProducts = foundProducts.filter(fp => 
      fp.userId && fp.userId.toString() !== userId
    );
    
    if (unauthorizedProducts.length > 0) {
      const unauthorizedIds = unauthorizedProducts.map(p => p._id.toString());
      return ApiResponse.errorResponse(res, 403, `Not authorized to modify products: ${unauthorizedIds.join(', ')}`);
    }

    // Create product updates map
    const productUpdatesMap = new Map();
    products.forEach(product => {
      if (product._id) {
        const { _id, ...productFields } = product;
        
        if (typeof productFields.paymentAndDelivery === "string") {
          try {
            productFields.paymentAndDelivery = JSON.parse(productFields.paymentAndDelivery);
          } catch (e) {
            console.error("Error parsing paymentAndDelivery:", e);
          }
        }

        productUpdatesMap.set(_id, productFields);
      }
    });

 
    const imageFiles = req.files?.image || [];
    const documentFiles = req.files?.document || [];

    console.log("Files received:", {
      imageCount: imageFiles.length,
      documentCount: documentFiles.length,
      hasMapping: !!fileMapping
    });


    const imageFileMap = new Map();
    const documentFileMap = new Map();

    if (fileMapping && Array.isArray(fileMapping)) {
      let imageIndex = 0;
      let documentIndex = 0;

      fileMapping.forEach((mapping) => {
        const formIndex = mapping.formIndex;
        
        if (mapping.hasImage && imageIndex < imageFiles.length) {
          imageFileMap.set(formIndex, imageFiles[imageIndex]);
          console.log(`Mapped image ${imageIndex} to form ${formIndex}`);
          imageIndex++;
        }
        
        if (mapping.hasDocument && documentIndex < documentFiles.length) {
          documentFileMap.set(formIndex, documentFiles[documentIndex]);
          documentIndex++;
        }
      });
    } else {
      imageFiles.forEach((file, idx) => imageFileMap.set(idx, file));
      documentFiles.forEach((file, idx) => documentFileMap.set(idx, file));
    }

    console.log("Final file mapping:", {
      imageForms: Array.from(imageFileMap.keys()),
      documentForms: Array.from(documentFileMap.keys())
    });

 
    const updatedProducts = await Promise.all(
      products.map(async (product, idx) => {
        const productId = product._id;
        const specificProductFields = productUpdatesMap.get(productId) || {};

   
        const imageFile = imageFileMap.get(idx);
        const documentFile = documentFileMap.get(idx);

        let imageUrl = null;
        if (imageFile) {
          imageUrl = imageFile.location || imageFile.path || null;
          console.log(`Image for form ${idx} (product ${productId}):`, imageUrl);
        }

        let documentUrl = null;
        if (documentFile) {
          documentUrl = documentFile.location || documentFile.path || null;
          console.log(`Document for form ${idx} (product ${productId}):`, documentUrl);
        }

        // Prepare update payload
        const updatePayload = {
          ...specificProductFields,
          draft: true
        };
        
        if (imageUrl) {
          updatePayload.image = imageUrl;
          if (imageFile.key) {
            updatePayload.imageKey = imageFile.key;
          }
        }
        
        if (documentUrl) {
          updatePayload.document = documentUrl;
        }

        console.log(`Updating product ${productId} (form ${idx}):`, {
          hasImage: !!imageUrl,
          hasDocument: !!documentUrl,
          fieldsCount: Object.keys(specificProductFields).length
        });


        const updateResult = await productSchema.updateOne(
          { _id: productId },
          { $set: updatePayload }
        );
        

        const updatedDoc = await productSchema.findById(productId);
        return updatedDoc;
      })
    );


    const validUpdatedProducts = updatedProducts.filter(p => p !== null);

    if (validUpdatedProducts.length === 0) {
      return ApiResponse.errorResponse(res, 500, "Failed to update any products");
    }

    return ApiResponse.successResponse(
      res,
      200,
      "Draft update successfully",
      {
        products: validUpdatedProducts,
        count: validUpdatedProducts.length
      }
    );

  } catch (error) {
    console.error('Error saving draft:', error);
    return ApiResponse.errorResponse(res, 500, error.message || "Failed to save draft");
  }
};