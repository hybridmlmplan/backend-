// backend/models/Rank.js
import mongoose from "mongoose";

const { Schema } = mongoose;

/**
 * Rank model
 *
 * यह मॉडल यूज़र के rank record को store करता है।
 * - user: यूज़र का reference
 * - packageType: किस पैकेज के लिये rank है (silver|gold|ruby)
 * - rank: वर्तमान rank नाम (Star, Silver Star, Gold Star, ...)
 * - achievedAt: कब rank मिला
 * - pairCountForRank: rank के लिये जो pair/count requirement हो उसे track करने के लिए
 * - metadata: किसी भी अतिरिक्त numeric/stat data के लिये (उदा. pairsCompleted, pvAccumulated)
 * - isActive: क्या यह current active rank entry है
 * - note: admin/meta notes
 *
 * साथ में कुछ static/helpers जो plan के अनुसार royalty% निकालना और rank upgrade criteria की मदद करेंगे।
 */

// Rank नामों की सूची (order preserve किया गया)
export const RANK_NAMES = [
  "Star",
  "Silver Star",
  "Gold Star",
  "Ruby Star",
  "Emerald Star",
  "Diamond Star",
  "Crown Star",
  "Ambassador Star",
  "Company Star"
];

// Royalty % mapping (आपने दिया था — Star: 3% up to Rs35 then ranks 1%..8%)
// Implementation detail:
// - special case: 'Star' => apply 3% upto ₹35 (engine को handle करना होगा जब amount >35)
// - बाकी ranks => fixed %
export const ROYALTY_PERCENT_BY_RANK = {
  "Star": 3,             // special: interpret in engine as "3% until ₹35" — engine must cap accordingly
  "Silver Star": 1,
  "Gold Star": 2,
  "Ruby Star": 3,
  "Emerald Star": 4,
  "Diamond Star": 5,
  "Crown Star": 6,
  "Ambassador Star": 7,
  "Company Star": 8
};

const RankSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // packageType: silver | gold | ruby
    packageType: {
      type: String,
      enum: ["silver", "gold", "ruby"],
      required: true,
      index: true
    },

    // current rank name (from RANK_NAMES)
    rank: {
      type: String,
      enum: RANK_NAMES,
      required: true,
      default: "Star",
      index: true
    },

    // When user achieved this rank
    achievedAt: { type: Date, default: Date.now },

    // For bookkeeping — how many qualifying pairs or PV contributed towards this rank
    pairCountForRank: { type: Number, default: 0 },

    // Generic numeric metadata (pairsCompleted, pvAccumulated, directsCount etc.)
    metadata: {
      pairsCompleted: { type: Number, default: 0 },
      pvAccumulated: { type: Number, default: 0 },
      directsCount: { type: Number, default: 0 },
      secondLevelCount: { type: Number, default: 0 },
      thirdLevelCount: { type: Number, default: 0 }
    },

    // active flag: true = this is the user's current active rank entry
    isActive: { type: Boolean, default: true, index: true },

    // any admin notes
    note: { type: String, default: "" }
  },
  {
    timestamps: true
  }
);

/**
 * STATIC HELPERS
 */

// Return royalty percent for a given rank name
RankSchema.statics.getRoyaltyPercent = function (rankName) {
  // If unknown rank -> 0
  if (!rankName || !ROYALTY_PERCENT_BY_RANK.hasOwnProperty(rankName)) return 0;
  return ROYALTY_PERCENT_BY_RANK[rankName];
};

// Return ordered rank index (0-based) for comparisons
RankSchema.statics.rankIndex = function (rankName) {
  const idx = RANK_NAMES.indexOf(rankName);
  return idx === -1 ? null : idx;
};

// Check if rankA < rankB
RankSchema.statics.isLowerRank = function (rankA, rankB) {
  const iA = this.rankIndex(rankA);
  const iB = this.rankIndex(rankB);
  if (iA === null || iB === null) return null;
  return iA < iB;
};

/**
 * Instance method: promoteTo
 * - पुराने record isActive = false कर दे
 * - नए Rank document create कर दे या same doc update करे (यहां हम नए doc create करना आसान रखते हैं)
 *
 * Usage: await Rank.promote(userId, { packageType, newRank, metadata })
 */
RankSchema.statics.promote = async function (userId, { packageType, newRank, metadata = {}, note = "" } = {}) {
  if (!userId) throw new Error("userId required");
  if (!packageType) throw new Error("packageType required");
  if (!newRank) throw new Error("newRank required");

  // transaction-safe behavior desirable in production (use session) — here simple approach
  // deactivate previous active rank entries for this user+package
  await this.updateMany({ user: userId, packageType, isActive: true }, { $set: { isActive: false } });

  // create new rank doc
  const created = await this.create({
    user: userId,
    packageType,
    rank: newRank,
    achievedAt: new Date(),
    isActive: true,
    metadata: metadata || {},
    note
  });

  return created;
};

/**
 * Instance method: computeRoyaltyForAmount
 * - Returns the royalty amount (INR) for given gross amount based on this rank.
 * - Special handling: if rank === 'Star' and amount > 35, engine may want to apply 3% only upto 35.
 *   Here function returns both {percent, amount, specialCapApplied}
 */
RankSchema.methods.computeRoyaltyForAmount = function (grossAmount) {
  const rankName = this.rank;
  const percent = ROYALTY_PERCENT_BY_RANK[rankName] ?? 0;

  // special Star rule: 3% until ₹35
  if (rankName === "Star") {
    // Apply 3% on min(grossAmount, 35)
    const capBase = Math.min(Number(grossAmount || 0), 35);
    const royalty = (capBase * percent) / 100;
    return {
      rank: rankName,
      percent,
      baseForCalculation: capBase,
      royalty: Number(royalty.toFixed(2)),
      specialCapApplied: true
    };
  }

  const royalty = ((Number(grossAmount || 0) * percent) / 100);
  return {
    rank: rankName,
    percent,
    baseForCalculation: Number(grossAmount || 0),
    royalty: Number(royalty.toFixed(2)),
    specialCapApplied: false
  };
};

/**
 * Indexes
 */
RankSchema.index({ user: 1, packageType: 1, isActive: 1 });

export default mongoose.model("Rank", RankSchema);
