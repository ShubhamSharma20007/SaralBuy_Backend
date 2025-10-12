import mongoose from "mongoose";

const multiProductSchema = new mongoose.Schema({
  mainProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: function() { return this.draft === false; }
  },
  subProducts: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Product"
  }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category", required: true },
  subCategoryId: { type: mongoose.Schema.Types.ObjectId, required: true },
  draft: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

multiProductSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model("MultiProduct", multiProductSchema);