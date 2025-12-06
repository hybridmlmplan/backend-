import mongoose from "mongoose";

const royaltySchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  percentage: Number,
  period: String, // daily or monthly
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Royalty", royaltySchema);
