import express from "express";
import mongoose from "mongoose";
import Mill from "../models/Mill.js";
import MillMembership from "../models/MillMembership.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

router.post("/request", protect, requiredRole("staff"), async (req, res) => {
    try {
        const { millId } = req.body;

        //check for millId validation
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid mill ID.",
            });
        }

        //find the mill
        const mill = await Mill.findOne({
            _id: millId,
            isActive: true,
        });

        //if mill not found
        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or inactive.",
            });
        }

        //user id from the token
        const userId = req.user.id;

        //check for already existing membership between the user and the mill
        const existingMembership = await MillMembership.findOne({
            millId,
            userId,
        });

        if (existingMembership) {
            if (existingMembership.status === "pending") {
                return res.status(409).json({
                    success: false,
                    message: "Your membership request is already pending.",
                });
            }

            if (existingMembership.status === "active") {
                return res.status(409).json({
                    success: false,
                    message: "You are already a member of this mill.",
                });
            }

            // Allow a new request after rejection or removal.
            existingMembership.status = "pending";
            existingMembership.requestedAt = new Date();
            existingMembership.approvedAt = null;
            existingMembership.removedAt = null;

            await existingMembership.save();

            return res.status(200).json({
                success: true,
                message: "Membership request submitted again.",
                membership: existingMembership,
            });
        }

        //create new request if no already existing request found
        const membership = await MillMembership.create({
            millId,
            userId,
            role: "staff",
            status: "pending",
        });

        return res.status(201).json({
            success: true,
            message: "Membership request submitted successfully.",
            membership,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A membership request already exists for this mill.",
            });
        }

        console.error("Membership request error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not submit membership request.",
        });
    }
});

export default router;