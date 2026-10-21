
import express from "express";
import mongoose from "mongoose";
import Mill from "../models/Mill.js";
import MillCreditPolicy from "../models/MillCreditPolicy.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

const allowedFields = [
    "minTransactionValue",
    "minGrainWeightKg",
    "minRelationshipDays",
    "minOnTimePaymentRate",
    "blockIfOverdue",
    "maxOverdueAmount",
    "maxCreditLimit",
    "maxCreditDueDays",
    "isActive",
];

// Require explicit configuration when creating the first policy.
const requiredOnCreate = [...allowedFields];

const numericFields = [
    "minTransactionValue",
    "minGrainWeightKg",
    "minRelationshipDays",
    "minOnTimePaymentRate",
    "maxOverdueAmount",
    "maxCreditLimit",
    "maxCreditDueDays",
];

const booleanFields = ["blockIfOverdue", "isActive"];

// GET /api/credit-policies/:millId
router.get("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID.",
            });
        }

        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true,
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found.",
            });
        }

        const policy = await MillCreditPolicy.findOne({
            millId: mill._id,
        });

        if (!policy) {
            return res.status(404).json({
                success: false,
                message: "Credit policy has not been configured.",
            });
        }

        return res.status(200).json({
            success: true,
            policy,
        });
    } catch (error) {
        console.error("Get credit policy error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error.",
        });
    }
});

// PUT /api/credit-policies/:millId
// Create a complete policy or update an existing policy.
router.put("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID.",
            });
        }

        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id,
            isActive: true,
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found.",
            });
        }

        const body = req.body;

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return res.status(400).json({
                success: false,
                message: "Request body must be a JSON object.",
            });
        }

        const updates = {};

        for (const field of Object.keys(body)) {
            if (!allowedFields.includes(field)) {
                return res.status(400).json({
                    success: false,
                    message: `Field '${field}' is not allowed.`,
                });
            }

            updates[field] = body[field];
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one policy field.",
            });
        }

        for (const field of numericFields) {
            if (
                Object.hasOwn(updates, field) &&
                (
                    typeof updates[field] !== "number" ||
                    !Number.isFinite(updates[field])
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be a valid number.`,
                });
            }
        }

        for (const field of booleanFields) {
            if (
                Object.hasOwn(updates, field) &&
                typeof updates[field] !== "boolean"
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${field} must be true or false.`,
                });
            }
        }

        let policy = await MillCreditPolicy.findOne({
            millId: mill._id,
        });

        // First-time creation must configure every policy field.
        if (!policy) {
            const missingFields = requiredOnCreate.filter(
                (field) => !Object.hasOwn(updates, field)
            );

            if (missingFields.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: "Complete all fields when creating a credit policy.",
                    missingFields,
                });
            }

            policy = new MillCreditPolicy({
                millId: mill._id,
                ...updates,
            });

            await policy.save();

            return res.status(201).json({
                success: true,
                message: "Credit policy created successfully.",
                policy,
            });
        }

        // Update only supplied fields. Schema validation checks the
        // resulting document, including fields that were not changed.
        policy.set(updates);
        await policy.save();

        return res.status(200).json({
            success: true,
            message: "Credit policy updated successfully.",
            policy,
        });
    } catch (error) {
        if (
            error instanceof mongoose.Error.ValidationError ||
            error instanceof mongoose.Error.CastError
        ) {
            return res.status(400).json({
                success: false,
                message: "Credit policy contains invalid values.",
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                code: "CREDIT_POLICY_CONFLICT",
                message:
                    "A credit policy already exists for this mill. Fetch the latest policy and try again.",
            });
        }

        console.error("Save credit policy error:", error.message);

        return res.status(500).json({
            success: false,
            message: "Server error.",
        });
    }
});

export default router;
