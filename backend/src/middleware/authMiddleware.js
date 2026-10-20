import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

//checking authorization
export const protect = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        //if no authentication done
        if (!authHeader || !authHeader.startsWith("Bearer")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        //storing the auth token
        const token = authHeader.split(" ")[1]; //"Bearer abc123" -> ["Bearer", "abc123"] and [1] selects the "abc123"

        //if token not found
        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

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

        // storing the user data who has been authorized through JWT token
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