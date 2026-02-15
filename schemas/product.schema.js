import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: function() { return this.draft === false; }
  },
  quantity: {
    type: String
  },
  minimumBudget: { type: Number },
  description: { type: String },
  draft: { type: Boolean, default: false },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
  subCategoryId: { type: mongoose.Schema.Types.ObjectId}, // this is subcategoryId from category schema
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  image: { type: String, default: null },    
  document: { type: String, default: null }, 

  // ✅ New fields added
  color: { type: String },
  selectCategory: { type: String }, 
  brand: { type: String },
  additionalDeliveryAndPackage: { type: String },
  fuelType: { type: String},
  model: { type: String },
  transmission: { type: String},
  productCategory: { type: String },  // To avoid conflict with productType (already exists)
  gender: { type: String},
  typeOfAccessories: { type: String },
  // constructionToolType: { type: String },
  toolType: { type: String },
  rateAService: {
    type: String,
  },
  conditionOfProduct:String, // this is for only furniture 

  oldProductValue: {
    min: Number,
    max: Number,
  },

  // productCondition: String,

  paymentAndDelivery: {
    ex_deliveryDate: Date,
    paymentMode: String,
    gstNumber: { type: String, default: "" },
    organizationName: { type: String, default: "" },
    organizationAddress: { type: String, default: "" },
  },
// Track total number of bids placed on this product
  totalBidCount: { type: Number, default: 0 },
  budget:String, // this is not using
  bidActiveDuration: { type: String },
  imageKey:{type:String,default:null},
  brandName:{type:String},
  typeOfVehicle:{type:String},
  typeOfProduct:{type:String}, // user will describe
  productType: { type: String,}, // ["new_product", "old_product"]
  isMergeQuote:{
    type:Boolean,
    default:false
  }
},{
  timestamps:true
});

productSchema.index({ title: 1 });

export default mongoose.model("Product", productSchema);
