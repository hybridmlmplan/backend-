import User from "../models/User.js";

// ==============================
// Helper: Extract userId (no token)
// ==============================
const getUserId = (req) => {

  // priority: body
  if (req.body?.userId) return req.body.userId;

  // then query
  if (req.query?.userId) return req.query.userId;

  // then params
  if (req.params?.userId) return req.params.userId;

  return null;
};

// ==============================
// USER AUTH MIDDLEWARE (NO TOKEN)
// ==============================
export const protect = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    // If userId not provided → allow but no profile
    if (!userId) {
      req.user = null;
      return next();
    }

    const user = await User.findOne({ userId });

    // If user not exist → allow but null
    if (!user) {
      req.user = null;
      return next();
    }

    // Attach user to req
    req.user = {
      userId: user.userId,
      role: user.role || "user",

      // MLM plan fields
      rank: user.rank || "Star",
      pv: user.pv || 0,
      bv: user.bv || 0,
      wallet: user.wallet || 0,
      package: user.package || "Silver",
    };

    return next();

  } catch (err) {
    console.error("Protect error:", err);
    req.user = null;
    return next();
  }
};

// ==============================
// ADMIN AUTH MIDDLEWARE (NO TOKEN)
// ==============================
export const verifyAdmin = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    // No userId → access denied
    if (!userId) {
      return res.status(403).json({
        status: false,
        message: "Admin userId required",
      });
    }

    const user = await User.findOne({ userId });

    // not found
    if (!user) {
      return res.status(403).json({
        status: false,
        message: "User not found",
      });
    }

    // not admin
    if (user.role !== "admin") {
      return res.status(403).json({
        status: false,
        message: "Access denied: Admin only",
      });
    }

    // Attach admin
    req.user = {
      userId: user.userId,
      role: "admin",

      rank: user.rank || "Admin",
      wallet: user.wallet || 0,
    };

    return next();

  } catch (err) {
    console.error("Admin error:", err);

    return res.status(500).json({
      status: false,
      message: "Admin auth error",
    });
  }
};

export default protect;
