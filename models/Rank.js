import mongoose from "mongoose";

const rankSchema = new mongoose.Schema({
  userId: String,
  rank: String,
  achievedAt: Date,
  reward: Number,
});

export default mongoose.model("Rank", rankSchema);
