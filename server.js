import express from "express";
import cors from "cors";
import packageRoutes from "./routes/packageRoutes.js";

const app = express();

/* =========================
   MIDDLEWARE
========================= */
app.use(cors({
  origin: "http://frontend-coral-sigma-e2kty2zgpd.vercel.app",
  credentials: true
}));
app.use(express.json());

/* =========================
   ROUTES
========================= */

// Health check
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Backend is running"
  });
});

// API test
app.get("/api/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API working"
  });
});

// Package routes
app.use("/api", packageRoutes);

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
