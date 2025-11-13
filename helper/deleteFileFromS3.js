
import AWS from "aws-sdk";
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.Region,
});


export const deleteFileFromS3 = async (fileKey) => {
  try {
    const params = {
      Bucket: process.env.Bucket,
      Key: fileKey, 
    };
    await s3.deleteObject(params).promise();
    console.log('-------------------File deleted successfully from S3');
  } catch (error) {
    console.error("-----------------Failed to delete file:", error);
  }
};