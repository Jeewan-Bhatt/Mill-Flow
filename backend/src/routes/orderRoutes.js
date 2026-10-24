import express from "express";
import mongoose from "mongoose";

import Order from "../models/Order.js";
import Mill from "../models/Mill.js";
import Customer from "../models/Customer.js";
import MillMembership from "../models/MillMembership.js";

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

//View bookings for a specific mill by owner only
router.get("/mill/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        // 1. Validate mill ID
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        // 2. Verify that this mill belongs to the logged-in owner
        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or you do not have access."
            });
        }

        // 3. Retrieve this mill's orders
        const orders = await Order.find({
            millId: mill._id
        }).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: orders.length,
            orders
        });
    } catch (error) {
        console.error("Get mill orders error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve mill orders."
        });
    }
})

// RECORD GRAIN ARRIVAL
router.patch("/:orderId/arrival", protect, requiredRole("owner", "staff"), async (req, res) => {
    try {
        const { orderId } = req.params;
        const { actualWeightKg } = req.body;

        // 1. Validate order ID
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        // 2. Validate actual weight
        if (
            typeof actualWeightKg !== "number" ||
            !Number.isFinite(actualWeightKg) ||
            actualWeightKg <= 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Actual weight must be a positive number."
            });
        }

        // 3. Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        // 4. Verify access to this order's mill
        const mill = await Mill.findOne({
            _id: order.millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or inactive."
            });
        }

        if (req.user.role === "owner") {
            if (mill.ownerId.toString() !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: "You do not own this mill."
                });
            }
        } else {
            const membership = await MillMembership.findOne({
                millId: mill._id,
                userId: req.user.id,
                role: "staff",
                status: "active"
            });

            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: "You are not an active staff member of this mill."
                });
            }
        }

        // 5. Only booked orders can enter the queue
        if (order.status !== "booked") {
            return res.status(409).json({
                success: false,
                message: "Only booked orders can be marked as arrived."
            });
        }

        // 6. Record arrival and queue the order
        order.actualWeightKg = actualWeightKg;
        order.arrivedAt = new Date();
        order.status = "queued";

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Grain arrival recorded and order added to the queue.",
            order
        });
    } catch (error) {
        console.error("Record grain arrival error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to record grain arrival."
        });
    }
}
);

 // START ORDER PROCESSING
router.patch("/:orderId/start", protect, requiredRole("owner", "staff"), async (req, res) => {
    try {
        const { orderId } = req.params;

        // 1. Validate order ID
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        // 2. Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        // 3. Find the mill associated with this order
        const mill = await Mill.findOne({
            _id: order.millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or inactive."
            });
        }

        // 4. Verify access to the mill
        if (req.user.role === "owner") {
            if (mill.ownerId.toString() !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: "You do not own this mill."
                });
            }
        } else {
            const membership = await MillMembership.findOne({
                millId: mill._id,
                userId: req.user.id,
                role: "staff",
                status: "active"
            });

            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: "You are not an active staff member of this mill."
                });
            }
        }

        // 5. Only queued orders can start processing
        if (order.status !== "queued") {
            return res.status(409).json({
                success: false,
                message: "Only queued orders can start processing."
            });
        }

        // 6. Update processing status and start time
        order.status = "processing";
        order.startedAt = new Date();

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Order processing started successfully.",
            order
        });
    } catch (error) {
        console.error("Start order processing error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to start order processing."
        });
    }
});


 // COMPLETE ORDER
router.patch("/:orderId/complete", protect, requiredRole("owner", "staff"), async (req, res) => {
    try {
        const { orderId } = req.params;

        // 1. Validate order ID
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order ID."
            });
        }

        // 2. Find the order
        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        // 3. Find the mill associated with the order
        const mill = await Mill.findOne({
            _id: order.millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or inactive."
            });
        }

        // 4. Verify mill access
        if (req.user.role === "owner") {
            if (mill.ownerId.toString() !== req.user.id) {
                return res.status(403).json({
                    success: false,
                    message: "You do not own this mill."
                });
            }
        } else {
            const membership = await MillMembership.findOne({
                millId: mill._id,
                userId: req.user.id,
                role: "staff",
                status: "active"
            });

            if (!membership) {
                return res.status(403).json({
                    success: false,
                    message: "You are not an active staff member of this mill."
                });
            }
        }

        // 5. Only processing orders can be completed
        if (order.status !== "processing") {
            return res.status(409).json({
                success: false,
                message: "Only processing orders can be completed."
            });
        }

        // 6. Calculate the final amount using actual weight
        const finalAmount =
            order.rateUnit === "per_kg"
                ? order.actualWeightKg * order.serviceRate
                : (order.actualWeightKg / 100) * order.serviceRate;

        // 7. Complete the order
        order.status = "completed";
        order.completedAt = new Date();
        order.finalAmount = Number(finalAmount.toFixed(2));

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Order completed successfully.",
            order
        });
    } catch (error) {
        console.error("Complete order error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to complete order."
        });
    }
});


export default router;