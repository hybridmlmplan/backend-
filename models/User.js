// Backend/models/User.js
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { Schema } = mongoose;

/**
 * User model aligned with the provided Hybrid MLM Plan.
 * - Stores PV/BV, binary legs, wallet, rank/level metadata, EPINs, genealogy pointers, session flags etc.
 * - Pre-save password hashing
 * - comparePassword helper
 */

const PackageEnum = ["silver", "gold", "ruby", "none"];
const RankEnum = [
  "none",
  "star",
  "silver_star",
  "gold_star",
  "ruby_star",
  "emerald_star",
  "diamond_star",
  "crown_star",
  "ambassador_star",
  "company_star",
];

const UserSchema = new Schema(
  {
    // Basic identity + auth
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phone: { type: String, trim: true, index: true },
    password: { type: String, required: true },

    // Login id (usercode) — e.g. GSM0001 style
    userId: { type: String, unique: true, index: true },

    // Sponsor / placement
    sponsorId: { type: String, index: true }, // sponsor's userId
    placementId: { type: String, index: true }, // placement sponsor's userId (optional)
    placementSide: { type: String, enum: ["left", "right", "auto", null], default: null },

    // Package & activation via EPIN
    package: { type: String, enum: PackageEnum, default: "none" },
    packageActive: { type: Boolean, default: false },
    packageActivatedAt: { type: Date, default: null },
    packagePV: { type: Number, default: 0 }, // PV value of active package (35/155/1250)
    packagePairCapping: { type: Number, default: 1 }, // usually 1 pair per session

    // EPIN tokens owned
    epins: [{ type: Schema.Types.ObjectId, ref: "EPIN" }],

    // Wallets & ledgers
    wallet: {
      balance: { type: Number, default: 0 }, // withdrawable
      ledgerBalance: { type: Number, default: 0 }, // internal ledger
    },

    // PV/BV tracking (binary uses PV; BV used for royalty/fund/rank incomes)
    pvLeft: { type: Number, default: 0 },
    pvRight: { type: Number, default: 0 },

    totalPV: { type: Number, default: 0 }, // cumulative PV (useful for rules)
    totalBV: { type: Number, default: 0 }, // cumulative BV (for royalty/funds)

    // Binary & pairing state (simplified storage)
    // Store pending red pairs count per package type/session window if needed
    pendingPairs: [
      {
        package: { type: String, enum: PackageEnum },
        count: { type: Number, default: 0 },
        lastSession: { type: Schema.Types.ObjectId, ref: "Session" },
      },
    ],

    // Rank & Level metadata
    rank: { type: String, enum: RankEnum, default: "none", index: true },
    rankUpdatedAt: { type: Date },
    directsCount: { type: Number, default: 0 }, // direct members count
    levelCounts: [
      {
        level: { type: Number },
        count: { type: Number, default: 0 },
      },
    ],

    // Level income tracking ledger (could be aggregated)
    levelIncome: { type: Number, default: 0 },

    // Royalty metadata: to compute CTO BV and continuous royalty
    ctoBV: { type: Number, default: 0 },
    royaltyPaidTill: { type: Number, default: 0 }, // amount threshold tracked (eg until ₹35)

    // Fund pools participation flags (monthly/yearly)
    eligibleCarFund: { type: Boolean, default: false },
    eligibleHouseFund: { type: Boolean, default: false },
    eligibleTravel: { type: Boolean, default: false },

    // Genealogy / Binary tree pointers
    parentId: { type: String, index: true }, // immediate upline userId
    leftChildId: { type: String, default: null },
    rightChildId: { type: String, default: null },

    // Notifications & flags
    notifications: [{ type: Schema.Types.ObjectId, ref: "Notification" }],

    // Session / engine helpers
    sessionCaps: {
      // keeps track of how many pairs were paid in current session for each package
      silver: { type: Number, default: 0 },
      gold: { type: Number, default: 0 },
      ruby: { type: Number, default: 0 },
    },

    // Logging / audit
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },

    // KYC and admin flags
    kycVerified: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false },
    isFranchiseHolder: { type: Boolean, default: false },

    // Generic meta for extensibility
    meta: { type: Schema.Types.Mixed, default: {} },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Indexes to support common queries
 */
UserSchema.index({ sponsorId: 1 });
UserSchema.index({ placementId: 1 });
UserSchema.index({ package: 1 });
UserSchema.index({ phone: 1, email: 1 });

/**
 * Pre-save: hash password if changed
 */
UserSchema.pre("save", async function (next) {
  const user = this;
  if (!user.isModified("password")) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
    return next();
  } catch (err) {
    return next(err);
  }
});

/**
 * Helper to compare password
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Small helper to add PV/BV safely (atomic handlers should be used in services)
 */
UserSchema.methods.addPV = function (value) {
  this.totalPV = (this.totalPV || 0) + Number(value || 0);
  return this.totalPV;
};
UserSchema.methods.addBV = function (value) {
  this.totalBV = (this.totalBV || 0) + Number(value || 0);
  return this.totalBV;
};

/**
 * Virtuals
 */
UserSchema.virtual("isPackageActive").get(function () {
  return !!this.packageActive && this.package !== "none";
});

export default mongoose.model("User", UserSchema);
