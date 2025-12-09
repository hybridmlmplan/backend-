// models/LevelIncome.js
import mongoose from "mongoose";

const levelIncomeSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    level: { type: Number, required: true },
    bv: { type: Number, required: true },
    percentage: { type: Number, default: 0.5 },
    amount: { type: Number, required: true },
    txId: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("LevelIncome", levelIncomeSchema);
