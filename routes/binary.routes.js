import express from "express";
import { activateBinary } from "../controllers/binary.controller.js";

const router = express.Router();

router.post("/activate", activateBinary);

export default router;
