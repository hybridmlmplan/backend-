import jwt from "jsonwebtoken";

export default function auth(req, res, next) {
  const token = req.headers.authorization;

  if (!token) return res.json({ message: "No token" });

  try {
    const decode = jwt.verify(token, "SECRET");
    req.userId = decode.id;
    next();
  } catch (err) {
    res.json({ message: "Invalid token" });
  }
}
