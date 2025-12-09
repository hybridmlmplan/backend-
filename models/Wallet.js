// models/Wallet.js
import mongoose from "mongoose";

const walletSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0 },
    pending: { type: Number, default: 0 }, // withdrawal pending amount
  },
  { timestamps: true }
);

export default mongoose.model("Wallet", walletSchema);
