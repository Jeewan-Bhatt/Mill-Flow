import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

//checking authorization
export const protect = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const bearerMatch =
            typeof authHeader === "string"
                ? /^Bearer\s+(\S+)$/i.exec(authHeader.trim())
                : null;

        // Require exactly one token using the Bearer authentication scheme.
        if (!bearerMatch) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const token = bearerMatch[1];

        //is JWT_SECRET is missing
        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing.");

            return res.status(500).json({
                success: false,
                message: "Server configuration error."
            });
        }

        // verifying the JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Reject validly signed tokens that do not contain the claims MillFlow expects.
        const allowedRoles = ["owner", "staff", "customer"];
        if (
            !decoded ||
            typeof decoded.sub !== "string" ||
            !decoded.sub ||
            !allowedRoles.includes(decoded.role)
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token."
            });
        }

        req.user = {
            id: decoded.sub,
            role: decoded.role
        };

        return next();

    } catch (error) {
        if (
            error.name === "JsonWebTokenError" ||
            error.name === "TokenExpiredError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token."
            });
        }

        console.error("Authentication error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
};