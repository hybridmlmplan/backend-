import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";

import authRoute from "./routes/auth.js";
import userRoute from "./routes/user.js";
import rankRoute from "./routes/rank.js";
import genealogyRoute from "./routes/genealogy.js";
import incomeRoute from "./routes/income.js";

dotenv.config();

// Connect DB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/rank", rankRoute);
app.use("/api/genealogy", genealogyRoute);
app.use("/api/income", incomeRoute);

// Health Check
app.get("/", (req, res) => {
  res.send({
    success: true,
    message: "Hybrid MLM Backend API Running",
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Server Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on PORT ${PORT}`);
});
