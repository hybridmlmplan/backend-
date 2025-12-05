import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";

import authRoute from "./routes/auth.js";
import userRoute from "./routes/user.js";      // ADD THIS
import rankRoute from "./routes/rank.js";      // ADD THIS
import genealogyRoute from "./routes/genealogy.js"; // ADD THIS
import incomeRoute from "./routes/income.js";

dotenv.config();
connectDB();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
// Routes
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);              // MISSING ROUTE
app.use("/api/rank", rankRoute);              // MISSING ROUTE
app.use("/api/genealogy", genealogyRoute);    // MISSING ROUTE
app.use("/api/income", incomeRoute);
// Health check
app.get("/", (req, res) => {
  res.send("Hybrid MLM Backend API is running...");
});
// Listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on PORT ${PORT}`));

