import mongoose from "mongoose";

const royaltySchema = new mongoose.Schema({
  userId: String,
  percentage: Number,
  amount: Number,
  date: Date
});

export default mongoose.model("RoyaltyPool", royaltySchema);
