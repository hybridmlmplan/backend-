import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";

import levelRoutes from "./routes/levelRoutes.js";
import fundRoutes from "./routes/fundRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import epinRoutes from "./routes/epinRoutes.js";

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// mount routes
app.use("/api/auth", authRoutes);
app.use("/api/epin", epinRoutes);
app.use("/api/level", levelRoutes);
app.use("/api/fund", fundRoutes);

app.get("/", (req, res) => res.send("Hybrid MLM Backend OK"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running on port", PORT));
