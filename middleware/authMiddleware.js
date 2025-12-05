import jwt from "jsonwebtoken";
import User from "../models/User.js";

// ==================================
// Helper to extract token
// ==================================
const getToken = (req) => {
  const token = req.headers["authorization"];
  if (!token) return null;

  return token.startsWith("Bearer ")
    ? token.slice(7)
    : token;
};

// ==================================
// USER AUTH MIDDLEWARE
// ==================================
export const protect = async (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Authorization token missing",
      });
    }

    // verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "mlmsecret"
    );

    // decoded me "userId" ho, "id" nahi
    const user = await User.findOne({ userId: decoded.userId });

    if (!user) {
      return res.status(401).json({
        status: false,
        message: "User not found",
      });
    }

    req.user = user;

    next();

  } catch (error) {
    console.error("Auth error:", error);

    return res.status(401).json({
      status: false,
      message: "Invalid or expired token",
    });
  }
};


// ==================================
// ADMIN AUTH MIDDLEWARE
// ==================================
export const verifyAdmin = async (req, res, next) => {
  try {
    const token = getToken(req);

    if (!token) {
      return res.status(401).json({
        status: false,
        message: "Authorization token missing",
      });
    }

    // verify token
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

    // NOTE:
    // Your schema me ROLE field nahi hai
    // To silent bypass removed
    if (user.role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied: Admin only",
      });
    }

    req.user = user;

    next();

  } catch (error) {
    console.error("Admin Auth error:", error);

    return res.status(401).json({
      status: false,
      message: "Invalid or expired admin token",
    });
  }
};

export default protect;
