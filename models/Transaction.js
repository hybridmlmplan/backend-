// models/Transaction.js
import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    txId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    type: { type: String, default: "general" }, 
    status: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
    ref: { type: mongoose.Schema.Types.ObjectId, default: null }
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);
