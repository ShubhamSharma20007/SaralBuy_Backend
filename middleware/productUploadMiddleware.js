import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "saralbuy",
    allowed_formats: [
      "jpg", "jpeg", "png", "webp", "gif", "heic", "tiff", "bmp",
      "pdf", "doc", "docx", "xls", "xlsx", "txt", "csv", "ppt", "pptx",
    ],
    transformation: [{ width: 800, height: 800, crop: "limit" }],
    resource_type: "auto"
  }
});

// Multer configs for single and multiple product creation
const singleUploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).fields([
  { name: "image", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

const multiUploader = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).fields([
  { name: "image", maxCount: 20 },
  { name: "document", maxCount: 20 },
]);

/**
 * Middleware to handle file uploads for both single and multiple product creation.
 * Uses req.params.isMultiple to determine maxCount for each field.
 */
export function uploadProductFiles(req, res, next) {
  // Fallback for non-RESTful clients: also check req.body.isMultiple
  const isMultiple =
    (req.params && req.params.isMultiple === "true") ||
    (req.body && req.body.isMultiple === "true");

  const uploader = isMultiple ? multiUploader : singleUploader;

  uploader(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        success: false,
        message: `Multer error: ${err.message}`,
      });
    } else if (err) {
      return res.status(500).json({
        success: false,
        message: `Upload failed: ${err.message || "Unknown error"}`,
      });
    }
    next();
  });
}