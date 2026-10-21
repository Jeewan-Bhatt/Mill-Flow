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

//register mill
router.post("/", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millName, location, contactNo, services } = req.body;

        //validating the services
        const invalidServices = services.filter(service => !allowedServices.includes(service));

        if (invalidServices.length > 0) {
            return res.status(400).json({
                success: false,
                message: "One or more services are invalid.",
                invalidServices
            });
        }

        //check required fields
        if (
            !millName?.trim() ||
            !location?.trim() ||
            !contactNo?.trim() ||
            !Array.isArray(services) ||
            services.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required mill details."
            });
        }

        //check ownerId format
        // if (!mongoose.isValidObjectId(ownerId)) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Invalid ownerId format."
        //     });
        // }

        const ownerId = req.user.id;
        //create document using only allowed fields
        const mill = new Mill({
            millName: millName.trim(),
            ownerId,
            location: location.trim(),
            contactNo: contactNo.trim(),
            services
        });

        await mill.save();

        res.status(201).json({
            success: true,
            message: "Mill created successfully",
            data: mill,
        });

    } catch (error) {

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            })
        }

        console.log("Create mill error:", error);

        res.status(500).json({
            success: false,
            message: "Internal server error"
        });
    }
});

//get all registered mills for any owner
router.get("/", protect, requiredRole("owner"), async (req, res) => {
    try {
        //finding mills that are active at the moment
        const mills = await Mill.find({
            isActive: true,
            ownerId: req.user.id    //find mills associated with the same owner
        });

        return res.status(200).json({
            success: true,
            count: mills.length,
            data: mills,
        });
    } catch (error) {
        console.error("Fetch mills error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch mills",
        });
    }
});

//get the mill with id 
router.get("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "invalid mill ID",
            });
        }

        //find a mill if the mill with given id is active at the moment
        const mill = await Mill.findOne({
            _id: id,
            isActive: true,
            ownerId: req.user.id
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found",
            });
        }

        res.status(200).json({
            success: true,
            data: mill,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch mill",
        });
    }
});

//to update a mill through id
router.put("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        //check if the requested id is valid
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //list of fields allowed to update
        const allowedFields = [
            "millName",
            "location",
            "contactNo",
            "services",
            "isActive"
        ];

        //to store updated key-value pairs.
        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        //check if any object updated or not
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update."
            });
        }

        //millname validation
        if (
            updates.millName !== undefined &&
            (typeof updates.millName !== "string" ||
                !updates.millName.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Mill name cannot be empty."
            });
        }

        //location validation
        if (
            updates.location !== undefined &&
            (typeof updates.location !== "string" ||
                !updates.location.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Location cannot be empty."
            });
        }

        //to trim the extra whitespaces in the updated fields
        if (updates.millName !== undefined) {
            updates.millName = updates.millName.trim();
        }

        if (updates.location !== undefined) {
            updates.location = updates.location.trim();
        }

        //validating contactNumber
        if (updates.contactNo !== undefined &&
            (typeof updates.contactNo !== "string" ||
                !updates.contactNo.trim())
        ) {
            return res.status(400).json({
                success: false,
                message: "Contact number is invalid."
            });
        }

        //validating services
        if (updates.services !== undefined) {
            if (
                !Array.isArray(updates.services) ||
                updates.services.length === 0 ||
                updates.services.some(
                    service => !allowedServices.includes(service)
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid services provided."
                });
            }
        }

        //validating isActive
        if (
            updates.isActive !== undefined &&
            typeof updates.isActive !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "isActive must be true or false."
            });
        }

        //updating mill with given id
        const mill = await Mill.findByIdAndUpdate(
            {
                _id: id,
                ownerId: req.user.id,
            },
            updates,
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
        if (error.name === "ValidationError" ||
            error.name === "CastError") {
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

//delete a mill through id
router.delete("/:id", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        //request id validation
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid Mill ID",
            });
        }

        //updating mill isActive
        const mill = await Mill.findByIdAndUpdate(
            {
                _id: id,
                ownerId: req.user.id
            },
            { isActive: false },
            { new: true, runValidators: true }
        );

        //what if mill not found?
        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Mill deactivated successfully",
            data: mill
        });

    } catch (error) {
        console.error("Deactivate mill Error:", error)

        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
});


export default router;