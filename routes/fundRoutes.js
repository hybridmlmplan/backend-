import express from "express";
import { processFundIncome, getUserFundSummary } from "../services/fundService.js";

const router = express.Router();


// ============================================================
// PROCESS FUND INCOME
// ============================================================

router.post("/process/:userId", async (req, res) => {
  const { userId } = req.params;

  const result = await processFundIncome(userId);
  res.json(result);
});


// ============================================================
// GET USER FUND SUMMARY
// ============================================================

router.get("/summary/:userId", async (req, res) => {
  const { userId } = req.params;

  const result = await getUserFundSummary(userId);
  res.json(result);
});


// ============================================================
// EXPORT
// ============================================================

export default router;
