// routes/levelRoutes.js
import express from "express";
import { getLevelIncome } from "../controllers/levelController.js";

const router = express.Router();

router.get("/:userId", getLevelIncome);

export default router;
