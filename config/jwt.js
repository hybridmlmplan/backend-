// config/jwt.js
import jwt from "jsonwebtoken";
import env from "./env.js";

export function signToken(payload, opts = {}) {
  const secret = env.jwtSecret;
  const signOpts = { expiresIn: opts.expiresIn || env.jwtExpiresIn };
  return jwt.sign(payload, secret, signOpts);
}

export function verifyToken(token) {
  try {
    const secret = env.jwtSecret;
    return jwt.verify(token, secret);
  } catch (err) {
    // returns null on invalid
    return null;
  }
}
