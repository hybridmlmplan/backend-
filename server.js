import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("OK");
});

const PORT = process.env.PORT;

app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
