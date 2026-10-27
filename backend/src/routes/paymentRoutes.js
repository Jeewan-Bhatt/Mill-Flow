
import express from "express";

import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";
import { recordCashOrderPayment } from "../services/paymentService.js";

const router = express.Router();

// Record full cash payment — mill owner only.
router.post("/orders/:orderId/cash", protect, requiredRole("owner"), async (req, res) => {
    try {
        const payment = await recordCashOrderPayment({
            orderId: req.params.orderId,
            userId: req.user.id,
            notes: typeof req.body.notes === "string"
                ? req.body.notes.trim()
                : ""
        });

        return res.status(201).json({
            success: true,
            message: "Cash payment recorded successfully.",
            payment
        });
    } catch (error) {
        const message = error.message || "Unable to record payment.";

        const statusCode =
            message === "Order not found." ? 404 :
                message.startsWith("Invalid ") ? 400 :
                    message.startsWith("Only the") ? 403 :
                        message.includes("already been paid") ||
                            message.includes("not available for payment") ? 409 :
                            400;

        return res.status(statusCode).json({
            success: false,
            message
        });
    }
}
);

export default router;
