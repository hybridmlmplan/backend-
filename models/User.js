// models/User.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * User model — core fields according to final plan.
 *
 * Important:
 * - userCode: GSM0001...
 * - franchiseCode: FGSM0001... (when isFranchise = true)
 * - email: NOT unique (allowed reuse)
 * - sponsorId: required
 * - placementId: optional (if not provided, auto placement will be done by placement util)
 * - package: 'non_active' | 'silver' | 'gold' | 'ruby'
 * - pvBalance: per-package PV counters
 * - bvBalance: aggregate BV from purchases (used for BV-based incomes)
 * - walletBalance + walletLedger: immediate credits
 * - rankCounters: counts for income pairs / cutoff pairs per package
 * - rankStatus: numeric rank levels per package
 */

const WalletEntrySchema = new Schema({
  type: { type: String },            // 'credit'|'debit'
  amount: { type: Number },          // positive number
  source: { type: String },          // 'pair'|'rank'|'royalty'|'fund'|'order' etc.
  refId: { type: Schema.Types.ObjectId, default: null },
  note: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const PvBalanceSchema = new Schema({
  silver: { type: Number, default: 0 },
  gold: { type: Number, default: 0 },
  ruby: { type: Number, default: 0 }
}, { _id: false });

const RankCountersSchema = new Schema({
  // counts for ranking logic: incomePairs and cutoffPairs (per package)
  silverIncomePairs: { type: Number, default: 0 },
  silverCutoffPairs: { type: Number, default: 0 },
  goldIncomePairs: { type: Number, default: 0 },
  goldCutoffPairs: { type: Number, default: 0 },
  rubyIncomePairs: { type: Number, default: 0 },
  rubyCutoffPairs: { type: Number, default: 0 }
}, { _id: false });

const RankStatusSchema = new Schema({
  // numeric rank level (0 = Star, 1 = Silver Star, ...)
  silverRank: { type: Number, default: 0 },
  goldRank: { type: Number, default: 0 },
  rubyRank: { type: Number, default: 0 }
}, { _id: false });

const UserSchema = new Schema({
  userCode: { type: String, unique: true, index: true },   // GSM0001
  franchiseCode: { type: String, unique: true, sparse: true }, // FGSM0001 when franchise
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true },                     // non-unique allowed
  phone: { type: String, required: true, index: true, unique: true },
  passwordHash: { type: String, required: true },

  sponsorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  placementId: { type: Schema.Types.ObjectId, ref: 'User' },   // optional
  placementSide: { type: String, enum: ['left','right'], default: null },

  package: { type: String, enum: ['non_active','silver','gold','ruby'], default: 'non_active' },
  packageActivatedAt: { type: Date, default: null },

  pvBalance: { type: PvBalanceSchema, default: () => ({}) },
  bvBalance: { type: Number, default: 0 },

  walletBalance: { type: Number, default: 0 },
  walletLedger: { type: [WalletEntrySchema], default: [] },

  rankCounters: { type: RankCountersSchema, default: () => ({}) },
  rankStatus: { type: RankStatusSchema, default: () => ({}) },

  directs: [{ type: Schema.Types.ObjectId, ref: 'User' }],     // immediate directs
  genealogyPath: [{ type: Schema.Types.ObjectId, ref: 'User' }], // root->...->this

  epins: [{ type: String }],   // used epins codes

  isFranchise: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

// ---------------------- Pre-save hooks (notes) ----------------------
// Hooks reference utils which will be provided: utils/idGenerator.js and utils/placement.js
// - generateUserCode(): returns "GSM0001" etc. (atomic counter)
// - generateFranchiseCode(): returns "FGSM0001"
// - autoPlacementIfMissing(this) will find sponsor's weaker leg and set placementId/placementSide
//
// We intentionally do NOT run heavy placement logic here synchronously to avoid race conditions.
// The API controller activating signup should call placement service (atomic) after creating the user.
// If you want pre('validate') generation, enable the following when idGenerator util available:
//
// Example (when utils present):
// UserSchema.pre('validate', async function(next) {
//   if (!this.userCode) this.userCode = await generateUserCode();
//   if (this.isFranchise && !this.franchiseCode) this.franchiseCode = await generateFranchiseCode();
//   next();
// });
//
// --------------------------------------------------------------------

export default mongoose.model('User', UserSchema);
