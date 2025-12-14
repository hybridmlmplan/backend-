import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { success, error } from "../utils/response.js";

/* Generate numeric userId */
const generateUserId = async () => {
  const lastUser = await User.findOne().sort({ userId: -1 });
  return lastUser ? lastUser.userId + 1 : 100001;
};

/* SIGNUP */
export const signup = async (req, res) => {
  try {
    const { name, mobile, email, password, sponsorId, placementId, placement } =
      req.body;

    if (!name || !mobile || !password || !sponsorId) {
      return error(res, "Required fields missing");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userId = await generateUserId();

    const user = await User.create({
      userId,
      name,
      mobile,
      email,
      password: hashedPassword,
      sponsorId,
      placementId: placementId || null,
      placement: placement || "L"
    });

    return success(res, { userId: user.userId }, "Signup successful");
  } catch (err) {
    return error(res, err.message);
  }
};

/* LOGIN */
export const login = async (req, res) => {
  try {
    const { userId, password } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return error(res, "User not found", 404);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return error(res, "Invalid password", 401);

    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return success(res, { token }, "Login successful");
  } catch (err) {
    return error(res, err.message);
  }
};
