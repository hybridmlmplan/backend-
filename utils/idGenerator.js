// utils/idGenerator.js
import mongoose from "mongoose";

const CounterSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: { type: Number, default: 0 }
}, { timestamps: true });

const Counter = mongoose.model("Counter", CounterSchema);

async function getNext(key, prefix, pad = 4) {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  const num = String(counter.value).padStart(pad, "0");
  return `${prefix}${num}`;
}

// Generate User ID GSM0001
export async function generateUserCode() {
  return await getNext("user_code", "GSM");
}

// Generate Franchise ID FGSM0001
export async function generateFranchiseCode() {
  return await getNext("franchise_code", "FGSM");
}

export default {
  generateUserCode,
  generateFranchiseCode
};
