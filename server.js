import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";

// Routes
import authRoute from "./routes/auth.js";
import userRoute from "./routes/user.js";
import rankRoute from "./routes/rank.js";
import genealogyRoute from "./routes/genealogy.js";
import incomeRoute from "./routes/income.js";

dotenv.config();

// Connect DB
connectDB();

const app = express();

// ======================
// Middleware
// ======================
app.use(
  cors({
    origin: "*", // TODO: change to your frontend URL in future
    methods: "GET,POST,PUT,DELETE",
  })
);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ======================
// Routes
// ======================
app.use("/api/auth", authRoute);
app.use("/api/user", userRoute);
app.use("/api/rank", rankRoute);
app.use("/api/genealogy", genealogyRoute);
app.use("/api/income", incomeRoute);

// ======================
// Health Check
// ======================
app.get("/", (req, res) => {
  res.status(200).send(`
    <html>
    <body style="font-family: sans-serif; padding: 20px;">
      <h2>Hybrid MLM Backend API Working 🚀</h2>
      <p>Status: <b>Running</b></p>
    </body>
    </html>
  `);
});

// ======================
// 404 Handler
// ======================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  });
});

// ======================
// Global Error Handler
// ======================
app.use((err, req, res, next) => {
  console.error("Server Error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// ======================
// Server Listen
// ======================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Backend running on PORT ${PORT}`);
});

export default app;
