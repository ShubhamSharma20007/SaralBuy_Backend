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
    initiator: { type: String, default: "buyer" },
    closedDealStatus: {
      type: String,
      enum: ["pending", "waiting_seller_approval", "completed", "rejected"],
      default: "pending",
    },
    dealStatus: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("ClosedDeal", closedDealSchema);