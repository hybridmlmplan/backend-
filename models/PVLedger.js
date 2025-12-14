import mongoose from "mongoose";

const pvLedgerSchema = new mongoose.Schema({
  userId: String,
  fromUser: String,
  side: { type: String, enum: ["LEFT", "RIGHT"] },
  pv: Number,
  remark: String
}, { timestamps: true });

export default mongoose.model("PVLedger", pvLedgerSchema);
