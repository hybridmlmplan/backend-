import express from "express";
import cors from "cors";

const app = express();

// middleware
app.use(cors());
app.use(express.json());

// ROOT health check
app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Backend is running"
  });
});

// API test route
app.get("/api/test", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API working"
  });
});

// IMPORTANT: Railway PORT
const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port", PORT);
});
