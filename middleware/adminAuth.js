// middleware/adminAuth.js
import jwt from "jsonwebtoken";

export default function adminAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                status: false,
                message: "Authorization token missing"
            });
        }

        const token = authHeader.replace("Bearer ", "");

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                status: false,
                message: "Invalid or expired admin token"
            });
        }

        if (!decoded || decoded.role !== "admin") {
            return res.status(403).json({
                status: false,
                message: "Access denied. Admins only."
            });
        }

        // Attach admin details to request object
        req.admin = {
            id: decoded.id,
            role: decoded.role,
            permissions: decoded.permissions || []
        };

        next();

    } catch (error) {
        return res.status(500).json({
            status: false,
            message: "Admin authentication failed",
            error: error.message
        });
    }
}
