// routes/royaltyRoutes.js
import express from "express";
import { distributeHandler, logsHandler } from "../controllers/royaltyController.js";
import { adminMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/distribute", adminMiddleware, distributeHandler);
router.get("/logs", adminMiddleware, logsHandler);

export default router;
