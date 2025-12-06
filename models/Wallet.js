import mongoose from "mongoose";

const walletSchema = new mongoose.Schema({
  userId: String,
  amount: Number,
  type: { type: String }, // binary, royalty, level, fund
  remark: String,
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Wallet", walletSchema);
