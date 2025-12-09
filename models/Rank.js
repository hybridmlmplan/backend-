// models/Rank.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * Rank definitions per package type.
 * Seed this collection with rank rows for silver/gold/ruby (levels 0..8).
 * Example: { packageType: 'silver', level:0, name:'Star', pairIncome:10 }
 */

const RankSchema = new Schema({
  packageType: { type: String, enum: ['silver','gold','ruby'], required: true, index: true },
  level: { type: Number, required: true }, // 0..8
  name: { type: String, required: true },
  pairIncome: { type: Number, required: true }, // pair income at this rank
  order: { type: Number, default: 0 },
  requiredPairsForNext: { type: Number, default: 8 }, // usually 8
  isHighest: { type: Boolean, default: false }
}, { timestamps: true });

RankSchema.index({ packageType:1, level:1 }, { unique: true });

export default mongoose.model('Rank', RankSchema);
