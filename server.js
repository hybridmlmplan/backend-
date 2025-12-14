import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ status: "OK", message: "Backend Live 🚀" });
});

// 🔥 IMPORTANT FIX HERE
const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on ${HOST}:${PORT}`);
});
