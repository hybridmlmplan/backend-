import mongoose from "mongoose";

const levelSchema = new mongoose.Schema({
  userId: String,
  level: Number,
  totalMembers: Number,
  achievedAt: Date,
});

export default mongoose.model("Level", levelSchema);
