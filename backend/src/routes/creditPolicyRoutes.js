
import express from "express";
import mongoose from "mongoose";
import Mill from "../models/Mill.js";
import MillCreditPolicy from "../models/MillCreditPolicy.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

// GET /api/credit-policies/:millId
// Get or check the policy for a mill owned by the logged-in owner.
router.get("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        //check valid millId
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //find mill
        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found."
            });
        }

        //find policy of the mill
        const policy = await MillCreditPolicy.findOne({ millId });

        if (!policy) {
            return res.status(404).json({
                success: false,
                message: "Credit policy has not been configured."
            });
        }

        return res.status(200).json({
            success: true,
            policy
        });
    } catch (error) {
        console.error("Get credit policy error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
}
);

// PUT /api/credit-policies/:millId
// Create or update the policy for an owned mill.
router.put("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        //check for valid mill ID
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //find mill with the id
        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found."
            });
        }

        // declare allowed fields to update
        const allowedFields = [
            "minTransactionValue",
            "minGrainWeightKg",
            "minRelationshipDays",
            "minOnTimePaymentRate",
            "blockIfOverdue",
            "maxOverdueAmount",
            "maxCreditLimit",
            "maxCreditDueDays",
            "isActive"
        ];

        const body = req.body ?? {}; //If req.body is null or undefined, use an empty object {} instead.
        const updates = {};

        //update the fields
        for (const field of Object.keys(body)) {
            if (!allowedFields.includes(field)) {
                return res.status(400).json({
                    success: false,
                    message: `Field '${field}' is not allowed.`
                });
            }

            updates[field] = body[field];
        }

        //if no updates
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one policy field."
            });
        }

        // Validate field types before writing to the database.
        for (const field of [
            "minTransactionValue",
            "minGrainWeightKg",
            "minRelationshipDays",
            "minOnTimePaymentRate",
            "maxOverdueAmount",
            "maxCreditLimit",
            "maxCreditDueDays"
        ]) {
            if (
                field in updates &&
                (
                    typeof updates[field] !== "number" ||
                    !Number.isFinite(updates[field])
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be a valid number.`
                });
            }
        }

        for (const field of ["blockIfOverdue", "isActive"]) {
            if (
                field in updates &&
                typeof updates[field] !== "boolean"
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be true or false.`
                });
            }
        }

        const policy = await MillCreditPolicy.findOneAndUpdate(
            { millId: mill._id },   //finds the policy for this mill._id
            { $set: updates, $setOnInsert: { millId: mill._id } },  //updates the provided fields, sets millId only when creating a new policy
            {
                new: true,  //return the updated document
                upsert: true,   //creates a document if none exists
                runValidators: true,    //validates the updated fields
                setDefaultsOnInsert: true   //applies schema defaults when creating a new document
            }
        );

        return res.status(200).json({
            success: true,
            message: "Credit policy saved successfully.",
            policy
        });
    } catch (error) {
        if (error instanceof mongoose.Error.ValidationError) {
            return res.status(400).json({
                success: false,
                message: "Credit policy contains invalid values."
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Credit policy already exists. Try again."
            });
        }

        console.error("Save credit policy error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
}
);

export default router;
