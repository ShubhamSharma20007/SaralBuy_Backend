import mongoose from 'mongoose';

// const addressSchema = new mongoose.Schema({
//   addressLine: { type: String, },
//   city:        { type: String, },
//   state:       { type: String, },
//   pincode:     { type: String, },
//   country:     { type: String, }
// }, { _id: false });

const userSchema = new mongoose.Schema({
  firstName:      { type: String, },
  lastName:       { type: String, },
  email:          { type: String,unique:true,trim:true,sparse:true},
  phone:          { type: String, required: true },
  password:       { type: String },
  address:      { type: String, default: null },
  aadhaarNumber:  { type: String },
  aadhaarImage:   { type: String }, // file path or URL
  isAadhaarVerified: { type: Boolean, default: false },
  profileImage: { type: String, default: null },
  currentLocation:String,
  role:{
    type:String,
    enum:['user','admin'],
    default:'user'
  },
  status:{
    type:String,
    enum:['active','inactive'],
    default:'active'    
  },
  lastLogin:{
    type:Date,
    default:null
  }
}, { timestamps: true });

userSchema.index({ firstName: 1, lastName: 1, email: 1 });
export default mongoose.model('User', userSchema);