import mongoose from "mongoose";

const packageSchema = new mongoose.Schema({
  userId: String,
  packageName: String,
  activatedAt: Date
});

export default mongoose.model("Package", packageSchema);
