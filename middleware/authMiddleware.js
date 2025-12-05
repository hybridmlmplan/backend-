import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ==============================
// USER AUTH MIDDLEWARE
// ==============================
export const protect = async (req, res, next) => {
  try {
    const token = req.headers["authorization"];

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "No token provided",
      });
    }

    const actualToken = token.replace("Bearer ", "");

    const decoded = jwt.verify(
      actualToken,
      process.env.JWT_SECRET || "mlmsecret"
    );

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    req.user = user;
    next();
  } catch (error) {
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
  try {
    const token = req.headers["authorization"];

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "No token provided",
      });
    }

    const actualToken = token.replace("Bearer ", "");

    const decoded = jwt.verify(
      actualToken,
      process.env.JWT_SECRET || "mlmsecret"
    );

    const user = await User.findById(decoded.id);

    if (!user || user.role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied: Admin only",
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({
      status: false,
      message: "Invalid admin token",
    });
  }
};

// ==============================
// DEFAULT EXPORT (Keep for compatibility)
// ==============================
export default protect;
