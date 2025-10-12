import mongoose from "mongoose";

const approvedRequirementSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sellerDetails: {
      sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      budgetAmount: { type: Number, required: true }
    },
    // categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
    minBudget: { type: Number, required: true }, // from product.minimumBudget
    budget: { type: String }, // from product.budget
    date: { type: Date, default: Date.now }, // approval or deal date
  },
  { timestamps: true }
);

export default mongoose.model("ApprovedRequirement", approvedRequirementSchema);