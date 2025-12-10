// ===============================================
// HYBRID MLM BACKEND — MAIN SERVER FILE
// ===============================================

import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import { json, urlencoded } from "express";
import path from "path";
import { fileURLToPath } from "url";

// ====== Load .env ======
dotenv.config();

// ====== Initialize App ======
const app = express();

// ====== Middlewares ======
app.use(cors());
app.use(json({ limit: "50mb" }));
app.use(urlencoded({ extended: true }));
app.use(morgan("dev"));

// ====== Database ======
connectDB();

// ====== Serve Static Uploads ======
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===============================================
// ROUTES (FULL MLM SYSTEM)
// ===============================================

// --- AUTH ---
import authRoutes from "./routes/authRoutes.js";
app.use("/api/auth", authRoutes);

// --- PACKAGES / PURCHASE ---
import packageRoutes from "./routes/packageRoutes.js";
app.use("/api/package", packageRoutes);

// --- BINARY (PV Based) ---
import binaryRoutes from "./routes/binaryRoutes.js";
app.use("/api/binary", binaryRoutes);

// --- RANK SYSTEM ---
import rankRoutes from "./routes/rankRoutes.js";
app.use("/api/rank", rankRoutes);

// --- LEVEL SYSTEM ---
import levelRoutes from "./routes/levelRoutes.js";
app.use("/api/level", levelRoutes);

// --- FUNDS & POOLS (BV Based) ---
import fundRoutes from "./routes/fundRoutes.js";
app.use("/api/funds", fundRoutes);

// --- ROYALTY SYSTEM (Silver) ---
import royaltyRoutes from "./routes/royaltyRoutes.js";
app.use("/api/royalty", royaltyRoutes);

// --- EPIN SYSTEM ---
import epinRoutes from "./routes/epinRoutes.js";
app.use("/api/epin", epinRoutes);

// --- WALLET + LEDGER ---
import walletRoutes from "./routes/walletRoutes.js";
app.use("/api/wallet", walletRoutes);

// --- ORDERS (Repurchase BV) ---
import orderRoutes from "./routes/orderRoutes.js";
app.use("/api/order", orderRoutes);

// --- FRANCHISE SYSTEM ---
import franchiseRoutes from "./routes/franchiseRoutes.js";
app.use("/api/franchise", franchiseRoutes);

// --- NOTIFICATION SYSTEM ---
import notifyRoutes from "./routes/notifyRoutes.js";
app.use("/api/notify", notifyRoutes);

// --- ADMIN PANEL ---
import adminRoutes from "./routes/adminRoutes.js";
app.use("/api/admin", adminRoutes);

// ===============================================
// SESSION ENGINE — 8 DAILY SESSIONS
// ===============================================
import sessionScheduler from "./scripts/sessionScheduler.js";

// Auto-session engine (runs every 2 hours 15 minutes)
sessionScheduler();

// ===============================================
// ERROR HANDLER
// ===============================================
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: err.message,
  });
});

// ===============================================
// SERVER START
// ===============================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 HYBRID MLM Backend running on port ${PORT}`);
});
