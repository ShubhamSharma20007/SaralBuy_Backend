import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    budgetQuation: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    availableBrand: { type: String },
    earliestDeliveryDate: { type: Date },
    businessType:{type:String,enum:['individual','business']},
    businessDets:{
    company_name:String,
    company_reg_num:String,
    gst_num:String
    }
  },
  { timestamps: true }
);

export default mongoose.model("Bid", bidSchema);