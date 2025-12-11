// backend/models/FundPool.js
import mongoose from "mongoose";

/**
 * FundPool
 *
 * Singleton-ish collection that tracks company-level BV and named fund pools:
 * - totalCTOBV: cumulative company turnover BV (used for royalty % calc etc)
 * - carPoolMonthly: accumulated monthly pool for Car Fund (2% monthly of configured BV sources)
 * - housePoolMonthly: accumulated monthly pool for House Fund (2% monthly)
 * - travelFund: accumulated travel fund (yearly disbursement targets)
 * - history: brief ledger of major pool credits (timestamped) for audit
 *
 * NOTE:
 * - This model intentionally keeps pool update helpers here, but actual payout/distribution
 *   (selecting eligible users, creating payouts/transactions) must be performed by fundService
 *   / royaltyService where business-rules and user-eligibility live.
 * - Methods are atomic where possible (using findOneAndUpdate) to avoid race conditions.
 */

const FundPoolSchema = new mongoose.Schema(
  {
    // Global company turnover BV (CTO BV)
    totalCTOBV: { type: Number, default: 0 }, // never negative

    // Monthly pools (accumulate for monthly distribution)
    carPoolMonthly: { type: Number, default: 0 },
    housePoolMonthly: { type: Number, default: 0 },

    // Travel fund (yearly usage)
    travelFund: { type: Number, default: 0 },

    // Optional: other named pools (extendable)
    otherPools: {
      type: Map,
      of: Number,
      default: {}
    },

    // Simple history array for audit (capped)
    history: [
      {
        type: {
          type: String,
          enum: [
            "CTO_CREDIT",
            "POOL_CREDIT",
            "POOL_DEBIT",
            "POOL_RESET",
            "MANUAL_UPDATE"
          ],
          required: true
        },
        pool: { type: String, default: null }, // e.g. 'carPoolMonthly'
        amount: { type: Number, required: true },
        meta: { type: mongoose.Schema.Types.Mixed, default: {} },
        createdAt: { type: Date, default: Date.now }
      }
    ],

    // meta: configuration snapshot (percentages etc) - can be updated from admin panel
    config: {
      carPoolPercent: { type: Number, default: 2 }, // percent (2%)
      housePoolPercent: { type: Number, default: 2 }, // percent (2%)
      travelPoolPercent: { type: Number, default: 0 } // if ever needed
    }
  },
  {
    timestamps: true
  }
);

// ---------- Static / Instance helpers ----------

/**
 * getSingleton - returns the single FundPool document, create if missing
 */
FundPoolSchema.statics.getSingleton = async function () {
  let doc = await this.findOne({});
  if (!doc) {
    doc = await this.create({});
  }
  return doc;
};

/**
 * creditCTOBV(amount, meta)
 * - Add amount to totalCTOBV and (optionally) allocate configured percentages to pools.
 * - Returns updated FundPool doc.
 *
 * business plan integration:
 *   - When repurchase/BV occurs, call creditCTOBV(bvAmount, {source:'order', orderId})
 *   - This will increase totalCTOBV and add 2% to carPoolMonthly & 2% to housePoolMonthly
 *     per your plan (configurable).
 */
FundPoolSchema.statics.creditCTOBV = async function (amount, meta = {}) {
  if (!amount || amount <= 0) return null;

  const FundPool = this;
  const doc = await FundPool.getSingleton();

  // compute pool contributions
  const carAdd = (amount * (doc.config?.carPoolPercent || 0)) / 100;
  const houseAdd = (amount * (doc.config?.housePoolPercent || 0)) / 100;
  const travelAdd = (amount * (doc.config?.travelPoolPercent || 0)) / 100 || 0;

  const update = {
    $inc: {
      totalCTOBV: amount,
      carPoolMonthly: carAdd,
      housePoolMonthly: houseAdd,
      travelFund: travelAdd
    },
    $push: {
      history: {
        $each: [
          {
            type: "CTO_CREDIT",
            pool: null,
            amount,
            meta
          },
          ...(carAdd > 0
            ? [
                {
                  type: "POOL_CREDIT",
                  pool: "carPoolMonthly",
                  amount: carAdd,
                  meta: { reason: "CTO% allocation", parentMeta: meta }
                }
              ]
            : []),
          ...(houseAdd > 0
            ? [
                {
                  type: "POOL_CREDIT",
                  pool: "housePoolMonthly",
                  amount: houseAdd,
                  meta: { reason: "CTO% allocation", parentMeta: meta }
                }
              ]
            : []),
          ...(travelAdd > 0
            ? [
                {
                  type: "POOL_CREDIT",
                  pool: "travelFund",
                  amount: travelAdd,
                  meta: { reason: "CTO% allocation", parentMeta: meta }
                }
              ]
            : [])
        ]
      }
    }
  };

  // Limit history array length to last 200 entries for safety
  const opts = { new: true };
  const updated = await FundPool.findOneAndUpdate({}, update, opts);

  // trim history if too long (non-atomic; safe enough)
  if (updated.history && updated.history.length > 500) {
    updated.history = updated.history.slice(-500);
    await updated.save();
  }

  return updated;
};

/**
 * addToPool(poolName, amount, meta)
 * - Generic pool credit (admin or any service).
 * - poolName e.g. 'carPoolMonthly' | 'housePoolMonthly' | 'travelFund' | 'otherPools.someKey'
 */
FundPoolSchema.statics.addToPool = async function (poolName, amount, meta = {}) {
  if (!poolName || !amount || amount <= 0) throw new Error("Invalid args");
  const FundPool = this;
  const doc = await FundPool.getSingleton();

  const update = {};
  const push = {
    type: "POOL_CREDIT",
    pool: poolName,
    amount,
    meta
  };

  if (poolName.startsWith("otherPools.")) {
    update.$inc = { [poolName]: amount };
  } else {
    // known top-level pools
    update.$inc = { [poolName]: amount };
  }

  update.$push = { history: push };

  const updated = await FundPool.findOneAndUpdate({}, update, { new: true });
  return updated;
};

/**
 * consumeFromPool(poolName, amount, meta)
 * - Debit a pool (for distributions). Will not allow pool to go negative (throws).
 * - Caller must ensure eligibility logic & create wallet/transaction entries separately.
 */
FundPoolSchema.statics.consumeFromPool = async function (poolName, amount, meta = {}) {
  if (!poolName || !amount || amount <= 0) throw new Error("Invalid args");
  const FundPool = this;
  const doc = await FundPool.getSingleton();

  const current = poolName.startsWith("otherPools.")
    ? doc.otherPools.get(poolName.replace("otherPools.", "")) || 0
    : doc[poolName] ?? 0;

  if (current < amount) {
    throw new Error(`Insufficient funds in ${poolName} (have ${current}, need ${amount})`);
  }

  const update = { $inc: { [poolName]: -amount }, $push: { history: { type: "POOL_DEBIT", pool: poolName, amount: -amount, meta } } };
  const updated = await FundPool.findOneAndUpdate({}, update, { new: true });
  return updated;
};

/**
 * resetMonthlyPools(meta)
 * - Called at month boundary after distributing monthly pools.
 * - Moves monthly pools to history and sets them to 0.
 * - Optionally archive last amounts to history with meta.
 */
FundPoolSchema.statics.resetMonthlyPools = async function (meta = {}) {
  const FundPool = this;
  const doc = await FundPool.getSingleton();

  const toArchive = [
    { pool: "carPoolMonthly", amount: doc.carPoolMonthly || 0 },
    { pool: "housePoolMonthly", amount: doc.housePoolMonthly || 0 }
  ];

  const update = {
    $set: { carPoolMonthly: 0, housePoolMonthly: 0 },
    $push: {
      history: {
        $each: toArchive
          .filter((p) => p.amount && p.amount > 0)
          .map((p) => ({
            type: "POOL_RESET",
            pool: p.pool,
            amount: p.amount,
            meta
          }))
      }
    }
  };

  const updated = await FundPool.findOneAndUpdate({}, update, { new: true });
  return updated;
};

/**
 * adminUpdateConfig(newConfig) - safe partial update of config (e.g. change percents)
 */
FundPoolSchema.statics.adminUpdateConfig = async function (newConfig = {}) {
  const FundPool = this;
  const doc = await FundPool.getSingleton();
  doc.config = { ...doc.config, ...newConfig };
  doc.history.push({ type: "MANUAL_UPDATE", pool: null, amount: 0, meta: { newConfig } });
  await doc.save();
  return doc;
};

const FundPool = mongoose.model("FundPool", FundPoolSchema);
export default FundPool;
