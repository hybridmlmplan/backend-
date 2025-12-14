import mongoose from "mongoose";

const epinSchema = new mongoose.Schema({
  code: { type: String, unique: true },
  amount: Number,
  used: { type: Boolean, default: false },
  usedBy: String
}, { timestamps: true });

export default mongoose.model("EPIN", epinSchema);
