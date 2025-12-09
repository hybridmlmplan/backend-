import express from "express";
import { createOrder } from "../controllers/orderController.js";

const router = express.Router();

// Create order (repurchase / service order)
router.post("/create", createOrder);

export default router;
