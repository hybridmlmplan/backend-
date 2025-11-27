const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");

const app = express();

// MongoDB connect
mongoose
  .connect("YOUR_MONGO_CONNECTION_STRING_HERE")
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

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
