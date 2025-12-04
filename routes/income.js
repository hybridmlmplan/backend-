import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import * as income from "../controllers/incomeController.js";

const router = express.Router();

// DIRECT INCOME
router.get("/direct/:userId", protect, income.getDirectIncome);

// LEVEL INCOME
router.get("/level/:userId", protect, income.getLevelIncome);

// BINARY INCOME
router.get("/binary/:userId", protect, income.getBinaryIncome);

// MATCHING INCOME
router.get("/matching/:userId", protect, income.getMatchingIncome);

// ROYALTY INCOME
router.get("/royalty/:userId", protect, income.getRoyaltyIncome);

// FUND INCOME (repurchase)
router.get("/fund/:userId", protect, income.getFundIncome);

export default router;
