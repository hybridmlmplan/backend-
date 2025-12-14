import mongoose from "mongoose";

const pairSchema = new mongoose.Schema({
  userId: String,
  sessionNo: Number,
  side: String,
  status: { type: String, enum: ["RED", "GREEN"], default: "RED" },
  income: Number
}, { timestamps: true });

export default mongoose.model("PairHistory", pairSchema);
