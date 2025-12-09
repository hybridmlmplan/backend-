// middleware/adminAuth.js
export async function adminMiddleware(req, res, next) {
  try {
    // req.user should be populated by authMiddleware earlier
    const user = req.user;
    if (!user) {
      return res.status(401).json({ status:false, message: "Auth required" });
    }
    // support both flags
    if (user.isAdmin || user.role === "admin") {
      return next();
    }
    return res.status(403).json({ status:false, message: "Admin access required" });
  } catch (e) {
    console.error("adminMiddleware", e);
    return res.status(500).json({ status:false, message: "Server error" });
  }
}
