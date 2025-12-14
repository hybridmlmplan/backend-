import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load env
dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Health check (IMPORTANT for Railway)
app.get("/", (req, res) => {
  res.json({
    status: "SUCCESS",
    message: "Hybrid MLM Backend Running 🚀"
  });
});

// =====================
// TEMP TEST ROUTE
// =====================
app.get("/api/test", (req, res) => {
  res.json({ ok: true });
});

// =====================
// SERVER START
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
