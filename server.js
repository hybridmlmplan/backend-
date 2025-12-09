// ================================
// SERVER.JS — HYBRID MLM BACKEND
// ================================

import express from "express";
import cors from "cors";
import morgan from "morgan";
import env from "./config/env.js";
import { connectDB } from "./config/db.js";

// ===== ROUTES =====
import authRoutes from "./routes/authRoutes.js";
import packageRoutes from "./routes/packageRoutes.js";
import binaryRoutes from "./routes/binaryRoutes.js";
import rankRoutes from "./routes/rankRoutes.js";
import fundRoutes from "./routes/fundRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import epinRoutes from "./routes/epinRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import levelRoutes from "./routes/levelRoutes.js";
import royaltyRoutes from "./routes/royaltyRoutes.js";
import franchiseRoutes from "./routes/franchiseRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import notifyRoutes from "./routes/notifyRoutes.js";

const app = express();

// ================================
// GLOBAL MIDDLEWARES
// ================================
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("dev"));

// ================================
// HEALTH CHECK
// ================================
app.get("/", (req, res) => {
  res.json({
    status: true,
    message: "Hybrid MLM Backend Running ✔",
    version: "1.0.0",
  });
});

// ================================
// API ROUTES
// ================================
app.use("/api/auth", authRoutes);
app.use("/api/package", packageRoutes);
app.use("/api/binary", binaryRoutes);
app.use("/api/rank", rankRoutes);
app.use("/api/fund", fundRoutes);
app.use("/api/order", orderRoutes);       // your existing route
app.use("/api/epin", epinRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/level", levelRoutes);
app.use("/api/royalty", royaltyRoutes);
app.use("/api/franchise", franchiseRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notify", notifyRoutes);

// ================================
// ERROR HANDLER (LAST MIDDLEWARE)
// ================================
app.use((err, req, res, next) => {
  console.error("[SERVER ERROR]", err);
  res.status(500).json({
    status: false,
    message: "Internal server error",
    error: err.message || err.toString(),
  });
});

// ================================
// START SERVER
// ================================
const startServer = async () => {
  await connectDB();

  app.listen(env.port, () => {
    console.log(`\n=======================================`);
    console.log(` Hybrid MLM Backend Started ✔`);
    console.log(` PORT: ${env.port}`);
    console.log(` MODE: ${env.nodeEnv}`);
    console.log(`=======================================\n`);
  });
};

startServer();

// ================================
// GRACEFUL SHUTDOWN
// ================================
process.on("SIGINT", () => {
  console.log("Shutting down gracefully...");
  process.exit(0);
});
