import express from "express";
import * as incomeController from "../controllers/incomeController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// ===============================
// INCOME ROUTES
// ===============================

// DIRECT INCOME
router.get("/direct/:userId", authMiddleware, incomeController.getDirectIncome);

// LEVEL INCOME
router.get("/level/:userId", authMiddleware, incomeController.getLevelIncome);

// BINARY INCOME
router.get("/binary/:userId", authMiddleware, incomeController.getBinaryIncome);

// MATCHING / PAIR INCOME
router.get("/matching/:userId", authMiddleware, incomeController.getMatchingIncome);

// ROYALTY INCOME
router.get("/royalty/:userId", authMiddleware, incomeController.getRoyaltyIncome);

// FUND INCOME (repurchase / special fund wallet)
router.get("/fund/:userId", authMiddleware, incomeController.getFundIncome);

// ===============================
// EXPORT ROUTER
// ===============================
export default router;
