
import express from "express";
import Mill from "../models/Mill.js";
import mongoose from "mongoose";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

const allowedServices = [
    "paddy_processing",
    "wheat_grinding",
    "other_grains"
];

const allowedRateUnits = ["per_kg", "per_quintal"];

// Validate the complete service pricing array.
function isValidServicePricing(servicePricing) {
    if (!Array.isArray(servicePricing) || servicePricing.length === 0) {
        return false;
    }

    const seenServices = new Set(); //to store unique values only

    return servicePricing.every((service) => {
        if (
            !service ||
            typeof service.serviceType !== "string" ||
            !allowedServices.includes(service.serviceType) ||
            typeof service.rate !== "number" ||
            !Number.isFinite(service.rate) ||
            service.rate < 0 ||
            !allowedRateUnits.includes(service.rateUnit) ||
            seenServices.has(service.serviceType)
        ) {
            return false;
        }

        seenServices.add(service.serviceType);
        return true;
    });
}

// Register a mill
router.post("/", protect, requiredRole("owner"), async (req, res) => {
    try {
        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a JSON object."
            });
        }

        const {
            millName,
            location,
            contactNo,
            servicePricing
        } = req.body;

        if (
            typeof millName !== "string" ||
            !millName.trim() ||
            typeof location !== "string" ||
            !location.trim() ||
            typeof contactNo !== "string" ||
            !contactNo.trim() ||
            !isValidServicePricing(servicePricing)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Provide valid mill details and at least one valid priced service."
            });
        }

        const mill = new Mill({
            millName: millName.trim(),
            ownerId: req.user.id,
            location: location.trim(),
            contactNo: contactNo.trim(),
            servicePricing
        });

        await mill.save();

        return res.status(201).json({
            success: true,
            message: "Mill created successfully.",
            data: mill
        });
    } catch (error) {
        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        console.error("Create mill error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

// Get all active mills belonging to the logged-in owner
router.get("/", protect, requiredRole("owner"), async (req, res) => {
    try {
        const mills = await Mill.find({
            isActive: true,
            ownerId: req.user.id
        });

        return res.status(200).json({
            success: true,
            count: mills.length,
            data: mills
        });
    } catch (error) {
        console.error("Fetch mills error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch mills."
        });
    }
});

// Get one active mill by ID
router.get("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        const mill = await Mill.findOne({
            _id: id,
            isActive: true,
            ownerId: req.user.id
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: mill
        });
    } catch (error) {
        console.error("Fetch mill error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch mill."
        });
    }
});

// Update a mill
router.put("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body)
        ) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a JSON object."
            });
        }

        // Only these fields can be updated through this endpoint.
        const allowedFields = [
            "millName",
            "location",
            "contactNo",
            "servicePricing",
            "isActive"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update."
            });
        }

        // Validate mill name
        if (
            updates.millName !== undefined &&
            (
                typeof updates.millName !== "string" ||
                !updates.millName.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Mill name cannot be empty."
            });
        }

        // Validate location
        if (
            updates.location !== undefined &&
            (
                typeof updates.location !== "string" ||
                !updates.location.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Location cannot be empty."
            });
        }

        // Normalize string fields
        if (updates.millName !== undefined) {
            updates.millName = updates.millName.trim();
        }

        if (updates.location !== undefined) {
            updates.location = updates.location.trim();
        }

        // Validate contact number
        if (
            updates.contactNo !== undefined &&
            (
                typeof updates.contactNo !== "string" ||
                !updates.contactNo.trim()
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Contact number is invalid."
            });
        }

        if (updates.contactNo !== undefined) {
            updates.contactNo = updates.contactNo.trim();
        }

        // Validate service pricing when it is being updated
        if (
            updates.servicePricing !== undefined &&
            !isValidServicePricing(updates.servicePricing)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid service pricing provided."
            });
        }

        // Validate activation status
        if (
            updates.isActive !== undefined &&
            typeof updates.isActive !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "isActive must be true or false."
            });
        }

        // Only update a mill owned by the logged-in owner.
        const mill = await Mill.findOneAndUpdate(
            {
                _id: id,
                ownerId: req.user.id
            },
            {
                $set: updates
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Mill updated successfully.",
            data: mill
        });
    } catch (error) {
        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill data."
            });
        }

        console.error("Update mill error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

// Deactivate a mill instead of permanently deleting it
router.delete("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        const mill = await Mill.findOneAndUpdate(
            {
                _id: id,
                ownerId: req.user.id
            },
            {
                $set: {
                    isActive: false
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Mill deactivated successfully.",
            data: mill
        });
    } catch (error) {
        console.error("Deactivate mill error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

export default router;