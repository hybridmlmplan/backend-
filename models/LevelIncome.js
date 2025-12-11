// backend/models/LevelIncome.js
import mongoose from "mongoose";

const { Schema, model } = mongoose;

/**
 * LevelIncome
 * Records level-based commissions (percentage of BV) paid to uplines.
 *
 * Fields:
 * - user: the user who receives the level income (upline)
 * - fromUser: the user that generated the BV (downline)
 * - level: integer (1..10) which level this payment belongs to
 * - bvAmount: the BV amount used to calculate this level income
 * - percentage: percentage applied (e.g. 0.5)
 * - amount: computed paid amount (bvAmount * percentage / 100)
 * - source: reason/source (e.g. "repurchase", "product_sale", "binary_conversion")
 * - meta: extra JSON for trace/debug (eg { sessionNumber, pairId })
 * - createdAt: timestamp
 */

const LevelIncomeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fromUser: { type: Schema.Types.ObjectId, ref: "User", required: true }, // who generated BV
    level: { type: Number, required: true, min: 1, max: 10, index: true },
    bvAmount: { type: Number, required: true, min: 0 },
    percentage: { type: Number, required: true, min: 0 }, // percentage value e.g. 0.5 for 0.5%
    amount: { type: Number, required: true, min: 0 }, // computed amount to credit
    source: { type: String, required: true, trim: true },
    meta: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: () => new Date(), index: true }
  },
  {
    versionKey: false
  }
);

// compound index for quick queries
LevelIncomeSchema.index({ user: 1, level: 1, createdAt: -1 });

// Default level percentages per your plan: Levels 1–10: 0.5% each
export const DEFAULT_LEVEL_PERCENTAGES = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

/**
 * Helper: compute amount from BV and percentage
 */
LevelIncomeSchema.statics.computeAmount = function (bvAmount, percentage) {
  const bv = Number(bvAmount) || 0;
  const pct = Number(percentage) || 0;
  // keep two decimal precision
  const amt = Math.floor((bv * pct) * 100) / 10000; // (bv * (pct/100)) rounded down to 2 decimals
  return Math.round(amt * 100) / 100;
};

/**
 * Create and save a LevelIncome entry.
 * - user: ObjectId (receiver)
 * - fromUser: ObjectId (generator of BV)
 * - level: 1..10
 * - bvAmount: numeric BV
 * - percentage: e.g. 0.5 for 0.5%
 * - source: string
 * - meta: object
 *
 * Returns created doc.
 */
LevelIncomeSchema.statics.createForBV = async function ({
  user,
  fromUser,
  level,
  bvAmount,
  percentage,
  source = "repurchase",
  meta = {}
}) {
  if (!user) throw new Error("Missing user (receiver) for level income");
  if (!fromUser) throw new Error("Missing fromUser (BV generator)");
  if (!level || level < 1 || level > 10) throw new Error("Level must be between 1 and 10");
  const pct = typeof percentage === "number" ? percentage : DEFAULT_LEVEL_PERCENTAGES[level - 1] || 0.5;
  const amount = this.computeAmount(bvAmount, pct);

  if (amount <= 0) {
    // create a zero-entry for audit (optional) — you can skip recording zero amounts if desired
    return await this.create({
      user,
      fromUser,
      level,
      bvAmount,
      percentage: pct,
      amount: 0,
      source,
      meta
    });
  }

  const doc = await this.create({
    user,
    fromUser,
    level,
    bvAmount,
    percentage: pct,
    amount,
    source,
    meta
  });

  return doc;
};

const LevelIncome = model("LevelIncome", LevelIncomeSchema);

export default LevelIncome;
