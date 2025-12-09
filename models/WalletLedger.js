// models/WalletLedger.js
import mongoose from "mongoose";

const walletLedgerSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    txId: { type: String, required: true, index: true },
    type: { type: String, enum: ["credit", "debit"], required: true },
    category: { type: String, default: "general" }, 
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    status: { type: String, enum: ["pending", "completed"], default: "completed" },
    ref: { type: mongoose.Schema.Types.ObjectId, default: null },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

export default mongoose.model("WalletLedger", walletLedgerSchema);
