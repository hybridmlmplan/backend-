import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ==============================
// Helper: Get token from Header
// ==============================
const getToken = (req) => {
  const header = req.headers["authorization"];
  if (!header) return null;

  if (header.startsWith("Bearer ")) {
    return header.replace("Bearer ", "");
  }

  return header;
};

// ==============================
// USER AUTH MIDDLEWARE
// ==============================
export const protect = async (req, res, next) => {

  // ==========================================
  // TEST MODE BYPASS (No token check)
  // ==========================================
  if (process.env.TEST_MODE === "true") {
    // Fake user attach only for testing
    req.user = { userId: "TEST_USER" };
    return next();
  }

  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Authorization token missing",
      });
    }

    // Decode
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mlmsecret"
    );

    // Find user
    const user = await User.findOne({ userId: decoded.userId });

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found",
      });
    }

    req.user = user;
    next();

  } catch (err) {
    console.error("Auth error:", err);

    return res.status(401).json({
      status: false,
      message: "Invalid or expired token",
    });
  }
};

// ==============================
// ADMIN AUTH MIDDLEWARE
// ==============================
export const verifyAdmin = async (req, res, next) => {

  // ==========================================
  // TEST MODE BYPASS (No token check)
  // ==========================================
  if (process.env.TEST_MODE === "true") {
    // Fake admin for testing
    req.user = { userId: "TEST_ADMIN", role: "admin" };
    return next();
  }

  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Authorization token missing",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mlmsecret"
    );

    const user = await User.findOne({ userId: decoded.userId });

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found",
      });
    }

    if (user.role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied: Admin only",
      });
    }

    req.user = user;
    next();

  } catch (err) {
    console.error("Admin Auth error:", err);

    return res.status(401).json({
      status: false,
      message: "Invalid or expired admin token",
    });
  }
};

export default protect;
