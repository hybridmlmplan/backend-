// backend/scripts/rankEngine.js
// Rank engine — auto upgrade based on pair counts (FINAL plan rules)
// - Uses pair_income transactions to compute pair counts
// - Promotion thresholds sequence: [5,6,7,8] (then 8 repeated)
// - On promotion: update user.rank, create RankHistory, credit one-time rank_upgrade income to wallet
// - All money ops done in mongoose transactions

import mongoose from "mongoose";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import Wallet from "../models/Wallet.js";
import RankHistory from "../models/RankHistory.js"; // optional but recommended

// Ordered rank keys (low -> high)
const RANKS = [
  "star",
  "silver_star",
  "gold_star",
  "ruby_star",
  "emerald_star",
  "diamond_star",
  "crown_star",
  "ambassador_star",
  "company_star"
];

// Promotion thresholds pattern: next-rank requires these many pairs.
// Index 0 => to go from RANKS[0] -> RANKS[1] require thresholds[0] pairs (i.e. 5)
const PROMO_THRESHOLDS = [5, 6, 7, 8]; // after exhausting, use last value (8)

// Rank income table by package type and rank (one-time upgrade payout)
// Amounts taken from your plan. If a rank has multiple values per package, mapping below uses that.
const RANK_INCOME = {
  silver: {
    star: 10,
    silver_star: 20,
    gold_star: 40,
    ruby_star: 80,
    emerald_star: 160,
    diamond_star: 320,
    crown_star: 640,
    ambassador_star: 1280,
    company_star: 2560
  },
  gold: {
    star: 50,
    silver_star: 100,
    gold_star: 200,
    ruby_star: 400,
    emerald_star: 800,
    diamond_star: 1600,
    crown_star: 3200,
    ambassador_star: 6400,
    company_star: 12800
  },
  ruby: {
    star: 500,
    silver_star: 1000,
    gold_star: 2000,
    ruby_star: 4000,
    emerald_star: 8000,
    diamond_star: 16000,
    crown_star: 32000,
    ambassador_star: 64000,
    company_star: 128000
  }
};

const SAFE_MIN = 0.000001;

/**
 * countPairIncome
 * Count number of pair_income transactions for a user for a given packageCode
 */
async function countPairIncome(userId, packageCode) {
  if (!userId) return 0;
  const q = { user: mongoose.Types.ObjectId(userId), type: "pair_income" };
  if (packageCode) q.packageCode = packageCode;
  return Transaction.countDocuments(q);
}

/**
 * getNextRankInfo
 * Returns { nextRankKey, threshold } or null if already at top
 */
function getNextRankInfo(currentRankKey) {
  const idx = RANKS.indexOf(currentRankKey);
  const nextIdx = idx === -1 ? 0 : idx + 1;
  if (nextIdx >= RANKS.length) return null;
  const threshold = PROMO_THRESHOLDS[Math.min(nextIdx - 1, PROMO_THRESHOLDS.length - 1)];
  return { nextRankKey: RANKS[nextIdx], threshold };
}

/**
 * upgradeUserRankIfEligible
 * Checks pair counts and upgrades user rank (looping if multiple promotions possible).
 * Credits one-time rank_upgrade income on each promotion (based on user's package type).
 *
 * @param {String|ObjectId} userId
 */
export async function upgradeUserRankIfEligible(userId) {
  if (!userId) throw new Error("upgradeUserRankIfEligible: missing userId");

  // Fetch fresh user doc (not lean) because we will update
  let user = await User.findById(userId);
  if (!user) return { status: false, message: "user not found" };

  const packageCode = user.packageCode || "silver"; // fallback
  if (!["silver", "gold", "ruby"].includes(packageCode)) {
    // If no package active, no upgrades
    return { status: false, message: "user has no active package for rank upgrade" };
  }

  const upgradesDone = [];

  // Loop: try to upgrade repeatedly while eligible
  while (true) {
    const currentRankKey = user.rank || RANKS[0]; // default to star if missing
    const nextInfo = getNextRankInfo(currentRankKey);
    if (!nextInfo) break; // top reached

    const { nextRankKey, threshold } = nextInfo;

    // Count pair incomes for this user and package
    const pairCount = await countPairIncome(user._id, packageCode);

    if (pairCount < threshold) break; // not eligible now

    // Perform upgrade (in transaction): set user.rank = nextRankKey, create RankHistory, credit wallet
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // Update user rank
      user.rank = nextRankKey;
      await user.save({ session });

      // Record RankHistory
      try {
        await RankHistory.create(
          [
            {
              user: user._id,
              newRank: nextRankKey,
              packageCode,
              triggerPairs: pairCount,
              createdAt: new Date()
            }
          ],
          { session }
        );
      } catch (e) {
        // non-fatal if model missing
      }

      // Credit one-time rank income (based on package's rank table)
      const incomeAmount = (RANK_INCOME[packageCode] && RANK_INCOME[packageCode][nextRankKey]) || 0;
      if (incomeAmount > SAFE_MIN) {
        await Wallet.updateOne(
          { user: user._id },
          { $inc: { balance: incomeAmount } },
          { upsert: true, session }
        );

        await Transaction.create(
          [
            {
              user: user._id,
              type: "rank_upgrade",
              packageCode,
              amount: incomeAmount,
              meta: { newRank: nextRankKey, triggerPairs: pairCount },
              createdAt: new Date()
            }
          ],
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      upgradesDone.push({ newRank: nextRankKey, pairCount, income: incomeAmount });

      // Refresh user doc for next iteration
      user = await User.findById(user._id);
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("upgradeUserRankIfEligible: transaction error", err);
      // stop further upgrades on error
      break;
    }
  } // end while

  return { status: true, upgrades: upgradesDone };
}

export default { upgradeUserRankIfEligible };
