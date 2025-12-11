// backend/config/db.js
// Mongoose DB connector — robust, retry + graceful shutdown
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const {
  MONGO_URI,           // Primary connection string (required)
  MONGO_REPLICA_SET,   // optional replica set name
  MONGO_USER,          // optional user
  MONGO_PASS,          // optional pass
  MONGO_AUTH_DB,       // optional authSource
  MONGO_DEBUG = "false",
  DB_POOL_SIZE = "10",
  DB_SOCKET_TIMEOUT_MS = "45000"
} = process.env;

if (!MONGO_URI) {
  console.error("FATAL: MONGO_URI not set in .env");
  process.exit(1);
}

const defaultOptions = {
  // Recommended options for modern mongoose/mongo-driver
  // keepUnifiedTopology true by default in newer drivers, set for safety
  useNewUrlParser: true,
  useUnifiedTopology: true,
  // connection pool
  maxPoolSize: parseInt(DB_POOL_SIZE, 10) || 10,
  socketTimeoutMS: parseInt(DB_SOCKET_TIMEOUT_MS, 10) || 45000,
  serverSelectionTimeoutMS: 30000 // fail fast if cannot reach server
};

// If user/pass provided, use them in options (for connection string without credentials)
if (MONGO_USER && MONGO_PASS) {
  defaultOptions.auth = { username: MONGO_USER, password: MONGO_PASS };
  if (MONGO_AUTH_DB) defaultOptions.authSource = MONGO_AUTH_DB;
}

// If replica set provided, pass it via direct connection string options or options object
if (MONGO_REPLICA_SET) {
  defaultOptions.replicaSet = MONGO_REPLICA_SET;
}

// enable mongoose debug optionally
if (MONGO_DEBUG === "true") {
  mongoose.set("debug", true);
}

let isConnected = false;

/**
 * connectDB
 * Attempts connection with Mongoose. Retries with exponential backoff on failure.
 * Returns mongoose connection promise.
 */
export async function connectDB(retries = 5, backoffMs = 1000) {
  if (isConnected) return mongoose.connection;

  const connectWithRetry = async (attempt = 1) => {
    try {
      // Use MONGO_URI directly (should include host(s) and DB name)
      await mongoose.connect(MONGO_URI, defaultOptions);
      isConnected = true;
      console.log(`MongoDB connected (attempt ${attempt}). DB host: ${getHostFromUri(MONGO_URI)}`);
      return mongoose.connection;
    } catch (err) {
      console.error(`MongoDB connection attempt ${attempt} failed:`, err.message || err);
      if (attempt >= retries) {
        console.error(`MongoDB: exhausted ${retries} retries — throwing error`);
        throw err;
      }
      const wait = backoffMs * Math.pow(2, attempt - 1);
      console.log(`Retrying MongoDB connection in ${wait}ms...`);
      await waitMs(wait);
      return connectWithRetry(attempt + 1);
    }
  };

  return connectWithRetry();
}

/**
 * disconnectDB
 * Graceful disconnect for shutdown scripts / tests
 */
export async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log("MongoDB disconnected gracefully.");
}

/**
 * Helper: wait ms
 */
function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract host info for logs (best-effort)
 */
function getHostFromUri(uri = "") {
  try {
    // naive parse to avoid importing url parser for mongodb+srv
    const withoutProto = uri.replace(/^mongodb(\+srv)?:\/\//, "");
    const hostPart = withoutProto.split("/")[0];
    return hostPart;
  } catch {
    return "unknown";
  }
}

/**
 * Bind process signals for graceful shutdown
 */
function setupGracefulShutdown() {
  const signals = ["SIGINT", "SIGTERM", "SIGQUIT"];
  signals.forEach((sig) => {
    process.on(sig, async () => {
      console.log(`Received ${sig} — shutting down MongoDB connection...`);
      try {
        await disconnectDB();
      } catch (e) {
        console.error("Error while disconnecting MongoDB:", e);
      } finally {
        process.exit(0);
      }
    });
  });

  // Handle unexpected errors
  process.on("uncaughtException", (err) => {
    console.error("Uncaught Exception:", err);
    // attempt graceful disconnect then exit
    disconnectDB().finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    disconnectDB().finally(() => process.exit(1));
  });
}

// Auto-setup graceful shutdown when this module is imported
setupGracefulShutdown();

export default {
  connectDB,
  disconnectDB,
  mongoose
};
