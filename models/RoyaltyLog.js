// models/RoyaltyLog.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const RoyaltyLogSchema = new Schema({
  sourceBV: { type: Number, required: true },       // BV that triggered royalty
  royaltyPool: { type: Number, required: true },    // pool amount = sourceBV * royaltyPoolPercent
  paidToUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
  userShare: { type: Number, required: true },      // user's share from pool
  userRankLevel: { type: Number, required: true },  // silverRank level at time
  txId: { type: String, required: true },
  note: { type: String, default: "" }
}, { timestamps: true });

RoyaltyLogSchema.index({ createdAt: -1 });
export default mongoose.model("RoyaltyLog", RoyaltyLogSchema);
