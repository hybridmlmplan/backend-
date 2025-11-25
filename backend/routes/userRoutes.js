import express from "express";
import { testUser } from "../controllers/userController.js";

const router = express.Router();

router.get("/test", testUser);

export default router;
