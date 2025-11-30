import jwt from "jsonwebtoken";
import User from "../models/User.js";

export const authMiddleware = async (req, res, next) => {
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

    req.user = user; // attach user to request
    next();
  } catch (error) {
    return res.status(401).json({
      status: false,
      message: "Invalid or expired token",
    });
  }
};
