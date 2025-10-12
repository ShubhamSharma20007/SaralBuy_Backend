import mongoose from "mongoose";

const closedDealSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    yourBudget: { type: Number, required: true },
    date: { type: Date, default: Date.now }, // Date of deal closure
    finalBudget: { type: Number },
    closedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("ClosedDeal", closedDealSchema);