const authRoutes = require("./routes/auth");
import express from "express";
import cors from "cors";
const app = express();
app.use(cors());
app.use("/api/auth", authRoutes);

app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("Backend running successfully!");
});

// Server start
app.listen(5000, () => {
  console.log("Server is running on port 5000");
});
