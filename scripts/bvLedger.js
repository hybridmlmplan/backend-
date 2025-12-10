// backend/scripts/bvLedger.js
// Central BV ledger helpers: credit BV, consume BV, calculate CTO BV
// Usage: await creditBV(userId, bv, meta)

import BVLedger from "../models/BVLedger.js"; // create model if not present
import FundPool from "../models/FundPool.js";

export async function creditBV(userId, bvAmount, meta = {}) {
  if (!bvAmount || bvAmount <= 0) return null;
  const entry = await BVLedger.create({ user: userId, amount: bvAmount, meta, createdAt: new Date() });
  // Add to FundPool CTO BV (company turnover BV)
  await FundPool.updateOne({}, { $inc: { totalBV: bvAmount } }, { upsert: true });
  return entry;
}

export async function consumeBV(userId, bvAmount, meta = {}) {
  if (!bvAmount || bvAmount <= 0) return null;
  const entry = await BVLedger.create({ user: userId, amount: -bvAmount, meta, createdAt: new Date() });
  await FundPool.updateOne({}, { $inc: { totalBV: -bvAmount } });
  return entry;
}

export default { creditBV, consumeBV };
