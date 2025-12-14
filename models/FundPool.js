import mongoose from "mongoose";

const fundSchema = new mongoose.Schema({
  userId: String,
  fundType: {
    type: String,
    enum: ["CAR", "HOUSE", "TRAVEL"]
  },
  amount: Number,
  date: Date
});

export default mongoose.model("FundPool", fundSchema);
