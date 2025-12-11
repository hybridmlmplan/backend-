// backend/config/jwt.js
// JWT helper — ES module, used across controllers/services for signing & verifying tokens.
// Requires environment vars: JWT_SECRET, JWT_ACCESS_EXPIRES (e.g. '15m'), JWT_REFRESH_EXPIRES (e.g. '30d')

import jwt from "jsonwebtoken";

/**
 * Load from env with safe defaults.
 * Make sure to set strong JWT_SECRET in production (at least 32+ chars).
 */
const JWT_SECRET = process.env.JWT_SECRET || "change_this_secret_in_production!";
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || "15m"; // short-lived access token
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || "30d"; // refresh token lifetime
const ISSUER = process.env.JWT_ISSUER || "hybridmlmplan";

/**
 * Create an access token.
 * payload: object (avoid sensitive data — use user id, role, package flags etc.)
 * options: optional jwt.sign options override (e.g. expiresIn)
 */
export function signAccessToken(payload = {}, options = {}) {
  const signOpts = {
    expiresIn: ACCESS_EXPIRES,
    issuer: ISSUER,
    ...options,
  };
  return jwt.sign(payload, JWT_SECRET, signOpts);
}

/**
 * Create a refresh token.
 * Typically store refresh tokens server-side (DB) or issue rotating refresh tokens.
 */
export function signRefreshToken(payload = {}, options = {}) {
  const signOpts = {
    expiresIn: REFRESH_EXPIRES,
    issuer: ISSUER,
    ...options,
  };
  return jwt.sign(payload, JWT_SECRET, signOpts);
}

/**
 * Verify token (generic).
 * Returns decoded payload or throws an error (use try/catch where called).
 */
export function verifyToken(token) {
  if (!token) throw new Error("No token provided for verification");
  return jwt.verify(token, JWT_SECRET, { issuer: ISSUER });
}

/**
 * Decode without verifying signature (useful for introspection — NOT for auth).
 */
export function decodeToken(token) {
  return jwt.decode(token, { complete: true });
}

/**
 * Express middleware to protect routes (expects Authorization: Bearer <token>).
 * Attaches decoded payload to req.user on success.
 */
export function authMiddleware(requiredRole = null) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization || req.headers.Authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ status: false, message: "Unauthorized: token missing" });
      }
      const token = authHeader.split(" ")[1].trim();
      const decoded = verifyToken(token);
      // optional role check
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ status: false, message: "Forbidden: insufficient role" });
      }
      req.user = decoded;
      next();
    } catch (err) {
      // token expired or invalid
      return res.status(401).json({ status: false, message: "Unauthorized: " + (err.message || "invalid token") });
    }
  };
}

/**
 * Utility: gracefully create access+refresh pair for a user object
 * userObj should contain stable identifier like { id: user._id, role, packageCode }
 */
export function createTokenPair(userObj = {}, accessOverrides = {}, refreshOverrides = {}) {
  const accessPayload = {
    sub: userObj.id || userObj._id || userObj.userId,
    role: userObj.role || "user",
    packageCode: userObj.packageCode || null,
    iat: Math.floor(Date.now() / 1000),
  };

  const refreshPayload = {
    sub: accessPayload.sub,
    type: "refresh",
    iat: Math.floor(Date.now() / 1000),
  };

  const accessToken = signAccessToken(accessPayload, accessOverrides);
  const refreshToken = signRefreshToken(refreshPayload, refreshOverrides);

  return { accessToken, refreshToken };
}

/**
 * Export config values to use elsewhere (helps testing / centralization)
 */
export const config = {
  JWT_SECRET,
  ACCESS_EXPIRES,
  REFRESH_EXPIRES,
  ISSUER,
};

export default {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  decodeToken,
  authMiddleware,
  createTokenPair,
  config,
};
