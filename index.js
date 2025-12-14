import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/* Middlewares */
app.use(cors());
app.use(express.json());

/* Root check (Railway + Browser) */
app.get("/", (req, res) => {
  res.status(200).send("Hybrid MLM Backend is LIVE 🚀");
});

/* Health check (Frontend / Monitor) */
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "backend",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/* 404 handler (important) */
app.use((req, res) => {
  res.status(404).json({
    error: "API not found"
  });
});

/* Safe server start */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`);
});
