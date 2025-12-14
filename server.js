import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// 🔴 Railway Health Check (PLAIN TEXT REQUIRED)
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/plain");
  res.status(200).send("OK");
});

// test api (for manual check)
app.get("/api/test", (req, res) => {
  res.json({ success: true });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
