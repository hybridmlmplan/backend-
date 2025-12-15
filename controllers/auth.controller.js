import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { success, error } from "../utils/response.js";

/* Generate numeric userId */
const generateUserId = async () => {
  const lastUser = await User.findOne().sort({ userId: -1 });
  return lastUser ? lastUser.userId + 1 : 100001;
};

/* ================= SIGNUP ================= */
export const signup = async (req, res) => {
  try {
    const {
      name,
      mobile,
      email,
      sponsorId,
      placementId,
      placementSide,
      packageKey,
      epin,
      loginId,
      password
    } = req.body;

    // basic validation (frontend aligned)
    if (!name || !mobile || !sponsorId || !loginId || !password) {
      return error(res, "Required fields missing");
    }

    // check duplicate loginId
    const exists = await User.findOne({ loginId });
    if (exists) {
      return error(res, "Login ID already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = await generateUserId();

    const user = await User.create({
      userId,
      loginId,
      name,
      mobile,
      email,
      sponsorId,
      placementId: placementId || null,
      placementSide: placementSide || "left",
      packageKey: packageKey || null,
      password: hashedPassword,
      isActive: false   // EPIN activate later
    });

    return success(
      res,
      { userId: user.userId },
      "Signup successful"
    );
  } catch (err) {
    return error(res, err.message || "Signup failed");
  }
};

/* ================= LOGIN ================= */
export const login = async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = await User.findOne({
      $or: [{ loginId: login }, { mobile: login }]
    });

    if (!user) return error(res, "User not found", 404);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return error(res, "Invalid password", 401);

    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      process.env.JWT_SECRET || "secret123",
      { expiresIn: "7d" }
    );

    return success(res, { token }, "Login successful");
  } catch (err) {
    return error(res, err.message || "Login failed");
  }
};
