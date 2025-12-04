import express from "express";
import * as income from "../controllers/incomeController.js";
import auth from "../middleware/authmiddleware.js";

const router = express.Router();

// DIRECT INCOME
router.get("/direct/:userId", auth, income.getDirectIncome);

// LEVEL INCOME
router.get("/level/:userId", auth, income.getLevelIncome);

// BINARY INCOME
router.get("/binary/:userId", auth, income.getBinaryIncome);

// MATCHING INCOME
router.get("/matching/:userId", auth, income.getMatchingIncome);

// ROYALTY INCOME
router.get("/royalty/:userId", auth, income.getRoyaltyIncome);

// FUND INCOME (repurchase)
router.get("/fund/:userId", auth, income.getFundIncome);

export default router;
