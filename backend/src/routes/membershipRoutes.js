import express from "express";
import mongoose from "mongoose";
import Mill from "../models/Mill.js";
import MillMembership from "../models/MillMembership.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

//request for the membership in any mill as a staff
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

//get all the pending membership requests
router.get("/pending", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.query;

        //millId validation
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid mill ID.",
            });
        }

        // Confirm this mill belongs to the logged-in owner
        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true,
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or you do not own this mill.",
            });
        }

        // Fetch pending requests for this mill only
        const requests = await MillMembership.find({
            millId: mill._id,
            status: "pending",
        })
            .populate("userId", "name email")
            .sort({ requestedAt: 1 });

        return res.status(200).json({
            success: true,
            count: requests.length,
            requests,
        });
    } catch (error) {
        console.error("Fetch pending requests error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not fetch membership requests.",
        });
    }
}
);

//approve the pending membership request of staff for the mill
router.patch("/:id/approve", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        // check if Id is valid
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid membership ID.",
            });
        }

        //find the membership request for the given id
        const membership = await MillMembership.findOne({
            _id: id,
            status: "pending",
        });

        if (!membership) {
            return res.status(404).json({
                success: false,
                message: "Pending membership request not found.",
            });
        }

        //find mill for the given membership request
        const mill = await Mill.findOne({
            _id: membership.millId,
            ownerId: req.user.id,
            isActive: true,
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or you do not own this mill.",
            });
        }

        membership.status = "active";
        membership.approvedAt = new Date();
        membership.removedAt = null;

        await membership.save();

        return res.status(200).json({
            success: true,
            message: "Staff membership approved successfully.",
            membership,
        });
    } catch (error) {
        console.error("Approve membership error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not approve membership request.",
        });
    }
}
);

router.patch("/:id/reject", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { id } = req.params;

        //check for valid id
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid membership ID.",
            });
        }

        //find a pending membership
        const membership = await MillMembership.findOne({
            _id: id,
            status: "pending",
        });

        //if pending membership not found
        if (!membership) {
            return res.status(404).json({
                success: false,
                message: "Pending membership request not found.",
            });
        }

        //find mill with the pending membership request
        const mill = await Mill.findOne({
            _id: membership.millId,
            ownerId: req.user.id,
            isActive: true,
        });

        //if mill not found?
        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or you do not own this mill.",
            });
        }

        //if mill found inside the pending membership request.
        //changing the membership status to rejected
        membership.status = "rejected";
        membership.approvedAt = null;

        //saving the updates
        await membership.save();

        return res.status(200).json({
            success: true,
            message: "Staff membership request rejected.",
            membership,
        });
    } catch (error) {
        console.error("Reject membership error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Could not reject membership request.",
        });
    }
}
);

export default router;