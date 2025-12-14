import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/health", (req, res) => {
  res.status(200).send("healthy");
});

const PORT = process.env.PORT;   // ❗ NO fallback

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
