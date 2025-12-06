import mongoose from "mongoose";

const binarySchema = new mongoose.Schema({
  userId: String,
  date: Date,
  session: { type: String, enum: ["morning", "evening"] },

  leftPv: Number,
  rightPv: Number,

  pairs: Number,
  income: Number,

  laps: Number,
});

export default mongoose.model("Binary", binarySchema);
