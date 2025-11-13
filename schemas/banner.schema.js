import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema({
    imageUrl: { type: String, default:null },
    linkUrl: { type: String, default: null },
    title: { type: String, default: null },
    imageKey: { type: String, default: null },
})
export default mongoose.model("Banner", bannerSchema);  