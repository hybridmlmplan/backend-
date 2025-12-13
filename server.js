// ===============================================
// HYBRID MLM BACKEND — MAIN SERVER FILE (STABLE)
// ===============================================

import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import connectDB from "./config/db.js";
import sessionScheduler from "./scripts/sessionScheduler.js";

// ===== Load ENV =====
dotenv.config();

// ===== Init App =====
const app = express();

// ===== Middlewares =====
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// ===== Health Check (CRITICAL FOR RAILWAY) =====
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "Hybrid MLM Backend",
    time: new Date().toISOString(),
  });
});

// ===== Static Uploads =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================================
// ROUTES
// ===============================================
import authRoutes from "./routes/authRoutes.js";
import packageRoutes from "./routes/packageRoutes.js";
import binaryRoutes from "./routes/binaryRoutes.js";
import rankRoutes from "./routes/rankRoutes.js";
import levelRoutes from "./routes/levelRoutes.js";
import fundRoutes from "./routes/fundRoutes.js";
import royaltyRoutes from "./routes/royaltyRoutes.js";
import epinRoutes from "./routes/epinRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import franchiseRoutes from "./routes/franchiseRoutes.js";
import notifyRoutes from "./routes/notifyRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

app.use("/api/auth", authRoutes);
app.use("/api/package", packageRoutes);
app.use("/api/binary", binaryRoutes);
app.use("/api/rank", rankRoutes);
app.use("/api/level", levelRoutes);
app.use("/api/funds", fundRoutes);
app.use("/api/royalty", royaltyRoutes);
app.use("/api/epin", epinRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/franchise", franchiseRoutes);
app.use("/api/notify", notifyRoutes);
app.use("/api/admin", adminRoutes);

// ===============================================
// GLOBAL ERROR HANDLER
// ===============================================
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({
    status: false,
    message: "Internal server error",
  });
});

// ===============================================
// START SERVER (ALWAYS FIRST)
// ===============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 HYBRID MLM Backend running on port ${PORT}`);
});

// ===============================================
// SAFE BOOT TASKS (AFTER LISTEN)
// ===============================================
(async () => {
  try {
    await connectDB();
    console.log("✅ MongoDB connected");

    sessionScheduler(); // scheduler NEVER blocks server
    console.log("✅ Session scheduler started");
  } catch (err) {
    console.error("BOOT ERROR:", err);
    // ❌ DO NOT process.exit() on Railway
  }
})();

// ===============================================
// PROCESS SAFETY (NO SILENT CRASH)
// ===============================================
process.on("unhandledRejection", err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
