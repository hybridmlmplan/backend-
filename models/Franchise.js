import mongoose from "mongoose";

const franchiseSchema = new mongoose.Schema({
  userId: String,
  bv: Number,
  percentage: Number,
  income: Number,
  date: Date
});

export default mongoose.model("Franchise", franchiseSchema);
