import express from "express";
import cors from "cors";

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
  res.json({
    success: true,
    message: "API working"
  });
});

// ✅ TEMP PACKAGE API (no crash)
app.get("/api/packages", (req, res) => {
  res.json([
    {
      name: "Silver",
      price: 35,
      pv: 35
    },
    {
      name: "Gold",
      price: 155,
      pv: 155
    },
    {
      name: "Ruby",
      price: 1250,
      pv: 1250
    }
  ]);
});

/* =========================
   SERVER START
========================= */
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
