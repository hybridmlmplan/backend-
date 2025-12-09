// routes/adminRoutes.js
import express from "express";
import { usersList, ordersList, franchisesList, pvLedgerList, bvLedgerList, pairsList, sessionsList } from "../controllers/adminController.js";
import { adminMiddleware } from "../middleware/adminAuth.js";

const router = express.Router();

router.get("/users", adminMiddleware, usersList);
router.get("/orders", adminMiddleware, ordersList);
router.get("/franchises", adminMiddleware, franchisesList);
router.get("/ledgers/pv", adminMiddleware, pvLedgerList);
router.get("/ledgers/bv", adminMiddleware, bvLedgerList);
router.get("/pairs", adminMiddleware, pairsList);
router.get("/sessions", adminMiddleware, sessionsList);

export default router;
