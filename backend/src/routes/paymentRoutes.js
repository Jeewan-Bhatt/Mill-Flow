import express from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";

import {
    recordCashOrderPayment,
    useCreditForOrder,
    recordCashCreditRepayment
} from "../services/paymentService.js";

import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

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

// Record cash credit repayment — mill owner only.
router.post("/credit-repayments/cash", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId, customerId, amount, notes } = req.body;

        const result = await recordCashCreditRepayment({
            millId,
            customerId,
            amount,
            userId: req.user.id,
            notes: typeof notes === "string" ? notes.trim() : ""
        });

        return res.status(201).json({
            success: true,
            message: "Cash credit repayment recorded successfully.",
            data: result
        });
    } catch (error) {
        const message = error.message || "Unable to record repayment.";

        const statusCode =
            message.includes("not found") ? 404 :
                message.includes("Only the") ? 403 :
                    message.includes("exceeds") ? 400 :
                        message.includes("changed") ? 409 :
                            message.includes("Invalid") ? 400 : 400;

        return res.status(statusCode).json({
            success: false,
            message
        });
    }
}
);

// Customer uses approved credit for a completed order.
router.post("/orders/:orderId/credit", protect, requiredRole("customer"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found."
            });
        }

        const result = await useCreditForOrder({
            orderId: req.params.orderId,
            customerId: customer._id,
            userId: req.user.id
        });

        return res.status(201).json({
            success: true,
            message: "Order charged to credit successfully.",
            data: result
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message || "Unable to use credit."
        });
    }
}
);



export default router;
