// models/FundPool.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * FundPool: records company BV for a period and computed pools for Car/House.
 * Distribution entries record user allocations.
 */

const FundDistributionEntry = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  amount: { type: Number },
  type: { type: String, enum: ['car','house'] },
  distributedAt: { type: Date, default: Date.now }
}, { _id: false });

const FundPoolSchema = new Schema({
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  companyBV: { type: Number, required: true, default: 0 },

  carPoolAmount: { type: Number, default: 0 },
  housePoolAmount: { type: Number, default: 0 },

  distributed: { type: [FundDistributionEntry], default: [] },

  createdAt: { type: Date, default: Date.now },
  processed: { type: Boolean, default: false }
});

FundPoolSchema.index({ periodStart:1, periodEnd:1 }, { unique: true });

export default mongoose.model('FundPool', FundPoolSchema);
