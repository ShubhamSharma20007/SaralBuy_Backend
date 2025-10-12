import AWS from "aws-sdk";
import multer from "multer";
import multerS3 from "multer-s3";
import dotenv from "dotenv";

dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.Region,
});

const allowedMimeTypes = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/tiff", "image/bmp", "image/avif",
  "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"
];

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only images and documents are allowed."), false);
  }
};

const storage = multerS3({
  s3: s3,
  bucket: process.env.Bucket,
  // acl: "public-read",
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: function (req, file, cb) {
    const folder = "saralbuy";
    const ext = file.originalname.split('.').pop();
    const filename = `${folder}/${Date.now()}-${file.fieldname}.${ext}`;
    cb(null, filename);
  }
});

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).fields([
  { name: "image", maxCount: 1 },
  { name: "document", maxCount: 1 },
]);

const uploadSingleImage = (req, res, next) => {
  uploader(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        console.log(err)
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
    }
    next();
  });
};

export default uploadSingleImage;
