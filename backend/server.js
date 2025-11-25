import express from "express";
import userRoutes from "./routes/userRoutes.js";
import cors from "cors";

// Create app
const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Routes
app.use("/api/user", userRoutes);

// Default test route
app.get("/", (req, res) => {
  res.send("Backend Server Running Successfully!");
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
