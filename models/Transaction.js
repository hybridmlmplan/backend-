import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema({
  userId: String,
  type: String, // pv or bv
  amount: Number,
  source: String, // product, package, renewal
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Transaction", transactionSchema);
