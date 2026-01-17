import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },

    budgetQuation: {
      type: Number,
      required: true
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active"
    },

    availableBrand: {
      type: String,
      default: ""
    },

    earliestDeliveryDate: {
      type: Date
    },


    sellerType: {
      type: String,
      default: ""
    },

    priceBasis: {
      type: String,
      default: ""
    },

    taxes: {
      type: String,
      default: ""
    },

    freightTerms: {
      type: String,
      default: ""
    },

    paymentTerms: {
      type: String,
      default: ""
    },

    location: {
      type: String,
      default: ""
    },

    buyerNote: {
      type: String,
      default: ""
    },

    businessType: {
      type: String,
      enum: ["individual", "business"]
    },

    businessDets: {
      company_name: { type: String, default: "" },
      company_reg_num: { type: String, default: "" },
      gst_num: { type: String, default: "" }
    }
  },
  { timestamps: true }
);


bidSchema.index(
  { sellerId: 1, buyerId: 1, productId: 1 },
  { unique: true }
);

export default mongoose.model("Bid", bidSchema);
