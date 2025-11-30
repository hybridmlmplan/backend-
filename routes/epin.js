import express from "express";
import {
  generateEPIN,
  transferEPIN,
  getAllEPINs,
  getEPINDetails,
  useEPIN
} from "../controllers/epinController.js";

const router = express.Router();

// ===============================
// ADMIN → Generate EPIN
// ===============================
router.post("/generate", generateEPIN);

// ===============================
// USER → Transfer EPIN User → User
// ===============================
router.post("/transfer", transferEPIN);

// ===============================
// ADMIN → List All EPINs
// ===============================
router.get("/list", getAllEPINs);

// ===============================
// EPIN DETAILS (Used by Admin + User)
// ===============================
router.get("/details/:epinCode", getEPINDetails);

// ===============================
// USE EPIN → ACTIVATE PACKAGE
// ===============================
router.post("/use", useEPIN);

export default router;
