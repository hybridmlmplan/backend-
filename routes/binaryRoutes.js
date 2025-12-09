// routes/binaryRoutes.js
import express from "express";
import { createManualPairHandler, processSessionHandler, pendingPairsHandler, listPairsHandler } from "../controllers/binaryController.js";
import { authMiddleware, adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/create-manual", adminMiddleware, createManualPairHandler);
router.post("/process-session", adminMiddleware, processSessionHandler);
router.get("/pending", authMiddleware, pendingPairsHandler);
router.get("/list", adminMiddleware, listPairsHandler);

export default router;
