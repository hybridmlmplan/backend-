import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  sessionNo: Number,
  start: String,
  end: String,
  executedAt: Date
});

export default mongoose.model("Session", sessionSchema);
