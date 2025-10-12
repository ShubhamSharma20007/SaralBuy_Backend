import mongoose from "mongoose";

const subCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    // products: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }] // array of product references
}, { _id: true });

const categorySchema = new mongoose.Schema({
    image: String,
    categoryName: { type: String, required: true },
    title: String,
    description: String,
    subCategories: [subCategorySchema]
}, { timestamps: true });

export default mongoose.model("Category", categorySchema);
