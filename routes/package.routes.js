import express from "express";
import { activatePackage } from "../controllers/package.controller.js";

const router = express.Router();
router.post("/activate", activatePackage);

export default router;
