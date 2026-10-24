import express from "express";
import mongoose from "mongoose";

import Order from "../models/Order.js";
import Mill from "../models/Mill.js";
import Customer from "../models/Customer.js";

import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

//Customer Booking
router.post("/", protect, requiredRole("customer"), async (req, res) => {
    try {
        const {
            millId,
            serviceType,
            grainType,
            estimatedWeightKg,
            customerNotes
        } = req.body;

        //Validate required fields
        if (
            !millId ||
            !serviceType?.trim() ||
            !grainType?.trim() ||
            !Number.isFinite(estimatedWeightKg) ||
            estimatedWeightKg <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide valid booking details."
            });
        }

        //Validate mill ID
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //Find an active mill
        const mill = await Mill.findOne({
            _id: millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or inactive."
            });
        }

        //Find the requested service and its price
        const service = mill.servicePricing.find(
            (item) => item.serviceType === serviceType.trim()
        );

        if (!service) {
            return res.status(400).json({
                success: false,
                message: "This mill does not offer the selected service."
            });
        }

        //Calculate the estimated amount
        const estimatedAmount =
            service.rateUnit === "per_kg"
                ? estimatedWeightKg * service.rate
                : (estimatedWeightKg / 100) * service.rate;

        // 6. Find the customer's profile
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found."
            });
        }

        // 7. Create the order
        const order = await Order.create({
            millId: mill._id,
            customerId: customer._id,
            createdBy: req.user.id,
            serviceType: service.serviceType,
            grainType: grainType.trim(),
            estimatedWeightKg,
            customerNotes:
                typeof customerNotes === "string"
                    ? customerNotes.trim()
                    : "",
            serviceRate: service.rate,
            rateUnit: service.rateUnit,
            currency: "NPR",
            estimatedAmount
        });

        return res.status(201).json({
            success: true,
            message: "Booking created successfully.",
            order
        });
    } catch (error) {
        console.error("Create order error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create booking."
        });
    }
});



export default router;