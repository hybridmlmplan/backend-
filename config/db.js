// config/db.js
import mongoose from "mongoose";
import env from "./env.js";

let isConnected = false;

export async function connectDB() {
  if (isConnected) return mongoose.connection;

  const opts = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    // useCreateIndex: true, // mongoose 6 removed options
  };

  try {
    await mongoose.connect(env.mongoUri, opts);
    isConnected = true;
    console.log("[DB] Connected to MongoDB");
    return mongoose.connection;
  } catch (err) {
    console.error("[DB] MongoDB connection error:", err);
    // retry logic (simple)
    const retrySeconds = 5;
    console.log(`[DB] Retry connecting in ${retrySeconds}s...`);
    await new Promise(r => setTimeout(r, retrySeconds * 1000));
    return connectDB();
  }
}

// Graceful close (use in shutdown)
export async function closeDB() {
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("[DB] Disconnected");
  } catch (err) {
    console.error("[DB] Error disconnecting:", err);
  }
}

export default { connectDB, closeDB };
