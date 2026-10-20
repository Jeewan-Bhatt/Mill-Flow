
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Mill from "../models/Mill.js";
import MillCustomer from "../models/MillCustomer.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

//Create customer profile
router.post("/profile", protect, requiredRole("customer"), async (req, res) => {
    try {
        const { phone, address = "" } = req.body;

        //check for valid phone number
        if (
            typeof phone !== "string" ||
            !/^[0-9+\-\s()]{7,20}$/.test(phone.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid phone number."
            });
        }

        //check for valid address
        if (
            typeof address !== "string" ||
            address.trim().length > 300
        ) {
            return res.status(400).json({
                success: false,
                message: "Address must be 300 characters or fewer."
            });
        }

        //get user with the user id in token
        const user = await User.findById(req.user.id).select("name");

        //if user not found?
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User account not found."
            });
        }

        //check if customer already exists
        const existingCustomer = await Customer.findOne({
            userId: user._id
        });

        if (existingCustomer) {
            return res.status(409).json({
                success: false,
                message: "Customer profile already exists.",
                customer: existingCustomer
            });
        }

        //create new customer
        const customer = await Customer.create({
            userId: user._id,
            name: user.name,
            phone: phone.trim(),
            address: address.trim()
        });

        return res.status(201).json({
            success: true,
            message: "Customer profile created successfully.",
            customer
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "Invalid customer profile data."
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Customer profile already exists."
            });
        }

        console.error("Create customer profile error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
}
);

//GET customer profile
router.get("/me", protect, requiredRole("customer"), async (req, res) => {
    try {
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found."
            });
        }

        return res.status(200).json({
            success: true,
            customer
        });
    } catch (error) {
        console.error("Get customer profile error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error."
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
        //Handle simultaneous duplicate requests
        if (error.code === 11000) {
            const relationship = await MillCustomer.findOne({
                millId: req.params.millId,
                customerId: (
                    await Customer.findOne({ userId: req.user.id })
                )?._id
            });

            if (relationship) {
                return res.status(200).json({
                    success: true,
                    message: "Customer-mill relationship already exists.",
                    relationship
                });
            }
        }

        console.error("Create customer-mill relationship error: ", error.message);

        return res.status(500).json({
            success: false,
            message: "server error."
        });
    }
})

//customer credit request endpoint
router.patch("/mills/:millId/credit-request", protect, requiredRole("customer"), async (req, res) => {
    try {
        const { millId } = req.params;

        //validate the mill ID
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //Find the logged in customer's profile
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found."
            });
        }

        //Verify that the mill is active
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

        // Require an existing customer-mill relationship
        const relationship = await MillCustomer.findOne({
            millId: mill._id,
            customerId: customer._id
        });

        if (!relationship) {
            return res.status(404).json({
                success: false,
                message: "Start a service with this mill before requesting credit."
            });
        }

        //Prevent duplicate or conflicting requests
        if (relationship.creditRequestStatus === "pending") {
            return res.status(409).json({
                success: false,
                message: "Your credit request is already pendng."
            });
        }

        if (relationship.creditRequestStatus === "approved") {
            return res.status(409).json({
                success: false,
                message: "Credit is already approved for this mill."
            });
        }

        //Create or renew the request
        relationship.creditRequestStatus = "pending";
        relationship.creditDueDays = 0;

        await relationship.save();

        return res.status(200).json({
            success: true,
            message: " Credit request submitted successfully.",
            creditRequestStatus: relationship.creditRequestStatus
        });
    } catch (error) {
        console.error("Customer credit request error: ", error.message);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
})

export default router;
