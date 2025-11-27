const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Backend running successfully!");
});

// Server start
app.listen(5000, () => {
  console.log("Server is running on port 5000");
});
