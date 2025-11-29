import Counter from "../models/Counter.js";

export const getNextGsmId = async () => {
  // Atomically increment counter
  const counter = await Counter.findOneAndUpdate(
    { _id: "gsm" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // Pad sequence → 000001 format
  const padded = String(counter.seq).padStart(6, "0");
  
  return "GSM" + padded;
};
