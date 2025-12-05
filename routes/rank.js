import express from "express";
const router = express.Router();

// TEST API
router.get("/", (req, res) => {
  res.json({ message: "Rank API working" });
});

export default router;
