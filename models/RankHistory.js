import mongoose from "mongoose";

const rankSchema = new mongoose.Schema({
  userId: String,
  package: String,
  rank: String,
  income: Number,
  achievedAt: Date
});

export default mongoose.model("RankHistory", rankSchema);
