// models/FranchiseOrder.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * FranchiseOrder: records a franchise sale / activation
 * - buyer: user who bought franchise
 * - franchise: franchise document (FGSM...) if assigned
 * - referrer: who referred (gets 1% BV)
 * - price, bv, pv (if any)
 * - commissionPaid: boolean
 */

const FranchiseOrderSchema = new Schema({
  orderCode: { type: String, required: true, unique: true },
  buyer: { type: Schema.Types.ObjectId, ref: "User", required: true },
  franchise: { type: Schema.Types.ObjectId, ref: "Franchise", default: null },
  referrer: { type: Schema.Types.ObjectId, ref: "User", default: null },
  price: { type: Number, required: true },
  bv: { type: Number, default: 0 },
  pv: { type: Number, default: 0 },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date, default: null },
  commissionPaid: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

FranchiseOrderSchema.index({ buyer:1, createdAt:-1 });

export default mongoose.model("FranchiseOrder", FranchiseOrderSchema);
