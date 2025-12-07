import express from "express";
import { processLevelIncome, getUserLevelSummary } from "../services/levelService.js";

const router = express.Router();

// ============================================================
// PROCESS USER LEVEL INCOME
// ============================================================

router.post("/process/:userId", async (req, res) => {
  const { userId } = req.params;

  const result = await processLevelIncome(userId);
  res.json(result);
});


// ============================================================
// GET USER LEVEL SUMMARY
// ============================================================

router.get("/summary/:userId", async (req, res) => {
  const { userId } = req.params;

  const result = await getUserLevelSummary(userId);
  res.json(result);
});


// ============================================================
// EXPORT
// ============================================================

export default router;
