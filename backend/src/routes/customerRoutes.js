
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Mill from "../models/Mill.js";
import MillCustomer from "../models/MillCustomer.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

//GET customer profile
router.get("/me", protect, requiredRole("customer"), async (req, res) => {
    try {
        const customer = await Customer.findOne({
            userId: req.user.id,
        }).populate("userId", "name email phone role");

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found.",
            });
        }

        return res.status(200).json({
            success: true,
            customer: {
                id: customer._id,
                name: customer.userId.name,
                email: customer.userId.email,
                phone: customer.userId.phone,
                role: customer.userId.role,
                address: customer.address,
                createdAt: customer.createdAt,
            },
        });
    } catch (error) {
        console.error("Get customer profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve customer profile.",
        });
    }
}
);

//Create Mill-Customer relationship
router.post("/mills/:millId/relationship", protect, requiredRole("customer"), async (req, res) => {
    try {
        const { millId } = req.params;

        //Validate the millId
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //find the customer's profile
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Create your customer profile first."
            });
        }

        //Insure the mill exists and is active
        const mill = await Mill.findOne({
            _id: millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found."
            });
        }

        //Return an existing relationship if one exists
        let relationship = await MillCustomer.findOne({
            millId: mill._id,
            customerId: customer._id
        });

        if (relationship) {
            return res.status(200).json({
                success: true,
                message: "Customer-mill relationship already exists.",
                relationship
            });
        }

        //create the relationship
        relationship = await MillCustomer.create({
            millId: mill._id,
            customerId: customer._id
        });

        return res.status(201).json({
            success: true,
            message: "Customer-mill relationship created successfully.",
            relationship
        });

    } catch (error) {
        if (error.code === 11000) {
            try {
                const customer = await Customer.findOne({
                    userId: req.user.id,
                });

                if (customer) {
                    const relationship = await MillCustomer.findOne({
                        millId: req.params.millId,
                        customerId: customer._id,
                    });

                    if (relationship) {
                        return res.status(200).json({
                            success: true,
                            message: "Customer-mill relationship already exists.",
                            relationship,
                        });
                    }
                }
            } catch (lookupError) {
                console.error(
                    "Duplicate relationship recovery error:",
                    lookupError.message
                );
            }
        }

        console.error(
            "Create customer-mill relationship error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to create customer-mill relationship.",
        });
    }
})

//customer credit request endpoint
router.patch("/mills/:millId/credit-request", protect, requiredRole("customer"), async (req, res) => {
    return res.status(503).json({
        success: false,
        code: "CREDIT_ELIGIBILITY_NOT_IMPLEMENTED",
        message:
            "Credit requests are temporarily unavailable while eligibility checks are being implemented.",
    });
}
);


export default router;
