// services/franchiseService.js
import mongoose from "mongoose";
import Franchise from "../models/Franchise.js";
import FranchiseOrder from "../models/FranchiseOrder.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import WalletLedger from "../models/WalletLedger.js";
import Transaction from "../models/Transaction.js";
import { v4 as uuidv4 } from "uuid";
import { generateFranchiseCode } from "../utils/idGenerator.js";

/**
 * Franchise service responsibilities:
 * - create franchise (admin)
 * - purchase franchise (user)
 * - process commission: referrer 1% on franchise BV, holder min 5% on price
 * - configurable commission per franchise row
 */

// Helper tx id
function txId(prefix = "FR") {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random()*90000)+10000}`;
}

// Admin: create franchise record (holder user must exist)
export async function createFranchise({ userId, commissionPercent = 5, referrerPercent = 1 }) {
  const code = await generateFranchiseCode();
  const fr = await Franchise.create({
    franchiseId: code,
    user: userId,
    commissionPercent,
    referrerPercent
  });
  return fr;
}

// User purchases franchise: create order and process commissions
export async function purchaseFranchise({ buyerId, price, bv = 0, referrerId = null }) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // create order code
    const orderCode = `FORDER-${Date.now().toString(36)}-${Math.floor(Math.random()*9999)}`;

    const order = await FranchiseOrder.create([{
      orderCode,
      buyer: buyerId,
      price,
      bv,
      pv: 0,
      referrer: referrerId
    }], { session });

    // If buyer chooses an existing franchise holder, assign to that holder (optional)
    // For now we keep franchise link null; admin may assign after purchase.

    // Process commissions:
    // 1) Referrer: 1% of BV to referrer (if present)
    if (referrerId && bv > 0) {
      const refShare = Number(((bv * 1) / 100).toFixed(2)); // 1% BV
      if (refShare > 0) {
        const w = await Wallet.findOneAndUpdate({ user: referrerId }, { $inc: { balance: refShare } }, { upsert: true, new: true, session });
        await WalletLedger.create([{
          userId: referrerId,
          txId: txId("FREF"),
          type: "credit",
          category: "franchise-referrer",
          amount: refShare,
          balanceAfter: w.balance,
          status: "completed",
          ref: order[0]._id,
          note: `Franchise referrer commission for order ${orderCode}`
        }], { session });
      }
    }

    // 2) Franchise holder commission handled when a franchise record is tied to this order; for simplicity we will leave holder commission to admin assign step. But we will pay min 5% holder if franchise exists:
    if (bv > 0) {
      // try find a franchise matching (simple: first active)
      const holder = await Franchise.findOne({ active: true }).session(session);
      if (holder) {
        const holderShare = Number(((price * holder.commissionPercent) / 100).toFixed(2)); // min 5% of price
        if (holderShare > 0) {
          const w2 = await Wallet.findOneAndUpdate({ user: holder.user }, { $inc: { balance: holderShare } }, { upsert: true, new: true, session });
          await WalletLedger.create([{
            userId: holder.user,
            txId: txId("FHLDR"),
            type: "credit",
            category: "franchise-holder",
            amount: holderShare,
            balanceAfter: w2.balance,
            status: "completed",
            ref: order[0]._id,
            note: `Franchise holder commission for order ${orderCode}`
          }], { session });
        }
      }
    }

    // Mark processed
    await FranchiseOrder.findByIdAndUpdate(order[0]._id, { processed: true, processedAt: new Date(), commissionPaid: true }, { session });

    await session.commitTransaction();
    session.endSession();

    return { order: order[0] };
  } catch (err) {
    try { await session.abortTransaction(); } catch(e){}
    session.endSession();
    throw err;
  }
}

// Admin: list orders (paginated)
export async function listFranchiseOrders({ limit = 100, skip = 0 } = {}) {
  const docs = await FranchiseOrder.find({}).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();
  return docs;
}
