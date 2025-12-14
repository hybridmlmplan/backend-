import express from "express";
import cors from "cors";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check (VERY IMPORTANT for Railway)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Backend is running 🚀"
  });
});

// Example API test route
app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

// Railway uses dynamic PORT
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
