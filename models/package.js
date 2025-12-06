import mongoose from "mongoose";

const packageSchema = new mongoose.Schema({
  name: { type: String, unique: true }, // silver, gold, ruby
  pv: Number,
  price: Number,
  pairIncome: Number,
  capping: Number,
});

export default mongoose.model("Package", packageSchema);
