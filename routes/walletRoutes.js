// routes/walletRoutes.js
import express from "express";
import { myWalletHandler, withdrawRequestHandler, ledgerHandler, adminApproveHandler, adminCreditHandler } from "../controllers/walletController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// user endpoints
router.get("/me", authMiddleware, myWalletHandler);
router.post("/withdraw", authMiddleware, withdrawRequestHandler);
router.get("/ledger", authMiddleware, ledgerHandler);

// admin endpoints
router.post("/admin/approve", adminMiddleware, adminApproveHandler);
router.post("/admin/credit", adminMiddleware, adminCreditHandler);

export default router;
