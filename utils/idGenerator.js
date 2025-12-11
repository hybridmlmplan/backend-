// utils/idGenerator.js
//
// Production-ready ID generators for the Hybrid MLM Plan
// - Atomic, concurrency-safe counters (Mongo-based)
// - Generators: userId (GSM####), franchiseId (FGSM####), productId, saleId, orderId, EPIN
//
// Usage examples:
//   const { generateUserId, generateFranchiseId, generateEPIN } = require("./utils/idGenerator");
//   const userId = await generateUserId(); // "GSM0001"
//   const fId = await generateFranchiseId(); // "FGSM0001"
//   const epin = generateEPIN(12); // "A7F3K9Z2Q1W6"
//
// Notes:
//  - This file expects Mongoose to be connected already (import mongoose from 'mongoose')
//  - Counter collection ensures atomic increments in high concurrency environments.
//  - If DB is not available, functions fall back to timestamp+crypto based ids as last resort.

import mongoose from "mongoose";
import crypto from "crypto";

/* -----------------------------
   Counter model (atomic increments)
   Schema: { _id: String (counter name), seq: Number }
   ----------------------------- */
const CounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // counter name
    seq: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false }
);

let Counter;
try {
  Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
} catch (e) {
  // In some environments re-registering models may throw; ignore
  Counter = mongoose.model("Counter");
}

/* -----------------------------
   Helper: getNextSequence (atomic)
   - name: unique counter name (e.g., "user", "franchise", "sale-2025-12-11")
   - returns next integer (1,2,3...)
   ----------------------------- */
async function getNextSequence(name) {
  if (!name) throw new Error("Counter name required");
  try {
    const r = await Counter.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return r.seq;
  } catch (e) {
    // DB may be down — fallback to timestamp-based pseudo-counter
    // This fallback is not strictly sequential across multiple servers,
    // but will still provide a reasonably unique value.
    const fallback = Number(Date.now().toString().slice(-6)); // last 6 digits ms
    return fallback;
  }
}

/* -----------------------------
   Helper: left-pad numeric ID
   ----------------------------- */
function padNumber(num, width) {
  const s = String(num || 0);
  if (s.length >= width) return s;
  return s.padStart(width, "0");
}

/* -----------------------------
   Generic generator: generateId
   - prefix: string prefix (e.g., 'GSM', 'FGSM')
   - counterName: name in Counter collection
   - pad: numeric width, e.g., 4 -> 0001
   ----------------------------- */
export async function generateId(prefix = "", counterName = "default", pad = 4) {
  try {
    const seq = await getNextSequence(counterName);
    const id = `${prefix}${padNumber(seq, pad)}`;
    return id;
  } catch (e) {
    // fallback unique id (timestamp + random)
    const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
    return `${prefix}${Date.now().toString().slice(-6)}${rand}`.slice(0, prefix.length + pad);
  }
}

/* -----------------------------
   Generate User ID: GSM0001, GSM0002...
   Counter name: "user"
   ----------------------------- */
export async function generateUserId() {
  return await generateId("GSM", "user", 4);
}

/* -----------------------------
   Generate Franchise ID: FGSM0001
   Counter name: "franchise"
   ----------------------------- */
export async function generateFranchiseId() {
  return await generateId("FGSM", "franchise", 4);
}

/* -----------------------------
   Generate Product ID: PROD000001
   Counter name: "product"
   pad default 6 for product numbers
   ----------------------------- */
export async function generateProductId() {
  return await generateId("PROD", "product", 6);
}

/* -----------------------------
   Generate Order ID: ORD-YYYYMMDD-0001
   Counter name uses date to keep daily sequence uniqueness
   ----------------------------- */
export async function generateOrderId() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = padNumber(date.getMonth() + 1, 2);
  const dd = padNumber(date.getDate(), 2);
  const dateKey = `${yyyy}${mm}${dd}`; // e.g., 20251211
  const counterName = `order-${dateKey}`;
  const seq = await getNextSequence(counterName);
  const id = `ORD-${dateKey}-${padNumber(seq, 4)}`;
  return id;
}

/* -----------------------------
   Generate Sale ID: SALE-YYYYMMDD-0001
   ----------------------------- */
export async function generateSaleId() {
  const date = new Date();
  const yyyy = date.getFullYear();
  const mm = padNumber(date.getMonth() + 1, 2);
  const dd = padNumber(date.getDate(), 2);
  const dateKey = `${yyyy}${mm}${dd}`;
  const counterName = `sale-${dateKey}`;
  const seq = await getNextSequence(counterName);
  const id = `SALE-${dateKey}-${padNumber(seq, 4)}`;
  return id;
}

/* -----------------------------
   Generate EPIN
   - length: length of EPIN (recommended 10-16)
   - charset: upper alphanumeric
   - option to format with dashes every N chars
   - This is cryptographically random using crypto.randomBytes
   ----------------------------- */
export function generateEPIN(length = 12, dashEvery = 0) {
  if (length <= 0) length = 12;
  // generate enough random bytes: each byte -> two hex chars; we want alphanum, so map bytes to base36 safe set
  const bytes = crypto.randomBytes(Math.ceil(length * 1.2));
  // convert to base36 and uppercase and remove non-alphanum if any
  let token = bytes.toString("base64").replace(/[+/=]/g, ""); // base64 -> remove + / =
  token = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // ensure token long enough; if not, append extra
  while (token.length < length) {
    token += crypto.randomBytes(4).toString("hex").toUpperCase();
    token = token.replace(/[^A-Z0-9]/g, "");
  }
  token = token.slice(0, length);
  if (dashEvery > 0 && dashEvery < length) {
    const parts = [];
    for (let i = 0; i < token.length; i += dashEvery) {
      parts.push(token.slice(i, i + dashEvery));
    }
    return parts.join("-");
  }
  return token;
}

/* -----------------------------
   Utility: generateTimestampId
   - fallback unique id using timestamp + random
   ----------------------------- */
export function generateTimestampId(prefix = "", suffixLen = 6) {
  const t = Date.now().toString(); // ms
  const rand = crypto.randomBytes(Math.ceil(suffixLen / 2)).toString("hex").toUpperCase();
  return `${prefix}${t}${rand}`.slice(0, prefix.length + t.length + suffixLen);
}

/* -----------------------------
   Exports (default and named)
   ----------------------------- */
export default {
  generateId,
  generateUserId,
  generateFranchiseId,
  generateProductId,
  generateOrderId,
  generateSaleId,
  generateEPIN,
  generateTimestampId,
  getNextSequence,
};
