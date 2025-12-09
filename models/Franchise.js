// models/Franchise.js
import mongoose from "mongoose";
const { Schema } = mongoose;

/**
 * Franchise model
 * Franchise ID format: FGSM0001
 * Holder earns minimum 5% on product sale price
 * Referrer earns 1% on franchise sale BV
 * Commission rules configurable product-wise
 */

const FranchiseSchema = new Schema({
  franchiseId: { type: String, required: true, unique: true, index: true }, // FGSM0001

  user: { type: Schema.Types.ObjectId, ref: "User", required: true },

  referrer: { type: Schema.Types.ObjectId, ref: "User" }, // who sold the franchise

  commissionPercent: { type: Number, default: 5 }, // holder %
  referrerPercent: { type: Number, default: 1 }, // referrer %

  totalSalesBV: { type: Number, default: 0 },
  totalCommissionEarned: { type: Number, default: 0 },
  totalReferrerEarned: { type: Number, default: 0 },

  active: { type: Boolean, default: true },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Franchise", FranchiseSchema);
