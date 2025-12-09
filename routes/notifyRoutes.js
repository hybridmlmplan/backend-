// routes/notifyRoutes.js
import express from "express";
import { sendNotification, myNotifications, markRead } from "../controllers/notifyController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminMiddleware } from "../middleware/adminAuth.js";

const router = express.Router();

router.post("/send", adminMiddleware, sendNotification);
router.get("/my", authMiddleware, myNotifications);
router.post("/read", authMiddleware, markRead);

export default router;
