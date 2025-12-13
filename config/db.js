// ===============================================
// MongoDB Connection (Railway / Production Safe)
// ===============================================

import mongoose from "mongoose";

let isConnected = false;

/**
 * Connect MongoDB
 * - No process.exit()
 * - No crash on missing env
 * - Railway friendly
 */
const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      console.warn("⚠️ MONGO_URI not found. Skipping MongoDB connection.");
      return;
    }

    if (isConnected) {
      console.log("ℹ️ MongoDB already connected");
      return;
    }

    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    isConnected = true;
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    // ❗ DO NOT EXIT PROCESS (Railway handles restarts)
  }
};

/**
 * Graceful disconnect (optional)
 */
const disconnectDB = async () => {
  try {
    if (!isConnected) return;
    await mongoose.disconnect();
    isConnected = false;
    console.log("MongoDB disconnected");
  } catch (err) {
    console.error("MongoDB disconnect error:", err.message);
  }
};

// Safe event logging (NO process.exit)
mongoose.connection.on("error", (err) => {
  console.error("MongoDB runtime error:", err.message);
});

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected");
});

export default connectDB;
export { disconnectDB };
