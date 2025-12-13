// ===============================================
// Hybrid MLM Backend
// MongoDB Connection (Production Safe)
// ===============================================

import mongoose from "mongoose";

let isConnected = false;

/**
 * MongoDB Connect
 * - No process.exit()
 * - No crash on missing env
 * - Fully compatible with Hybrid MLM plan
 */
const connectDB = async () => {
  try {
    // If DB URL not available, don't crash server
    if (!process.env.MONGO_URI) {
      console.warn("⚠️ MONGO_URI not set. MongoDB connection skipped.");
      return;
    }

    // Prevent multiple connections
    if (isConnected) return;

    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    // Log error only — never kill server
    console.error("❌ MongoDB connection error:", err.message);
  }
};

// Runtime safety logs (plan safe)
mongoose.connection.on("error", (err) => {
  console.error("MongoDB runtime error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export default connectDB;
