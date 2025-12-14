import express from "express";
import { generateEPIN } from "../controllers/epin.controller.js";

const router = express.Router();
router.post("/generate", generateEPIN);

export default router;
