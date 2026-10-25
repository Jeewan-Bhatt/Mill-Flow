import express from "express";
import mongoose from "mongoose";
import Mill from "../models/Mill.js";
import MillCreditPolicy from "../models/MillCreditPolicy.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";

const router = express.Router();

const rootFields = [
    "eligibilityWindowDays",
    "scoringWeights",
    "levels",
    "maxCreditLimit",
    "maxCreditDueDays",
    "blockIfOverdue",
    "maxOverdueAmount",
    "isActive"
];

const weightFields = [
    "transactionValue",
    "grainWeight",
    "relationshipDuration",
    "onTimePaymentRate",
    "fullyRepaidCreditUsage"
];

const levelFields = [
    "maxCreditLimit",
    "pointsThreshold",
    "minTransactionValue",
    "minGrainWeightKg",
    "minRelationshipDays",
    "minOnTimePaymentRate",
    "minFullyRepaidCreditUsage"
];

const levelNames = ["level1", "level2", "level3"];

const numericFields = [
    "eligibilityWindowDays",
    "maxCreditLimit",
    "maxCreditDueDays",
    "maxOverdueAmount"
];

const booleanFields = ["blockIfOverdue", "isActive"];

function rejectUnknownFields(object, allowedFields, path = "") {
    if (
        !object ||
        typeof object !== "object" ||
        Array.isArray(object)
    ) {
        return `${path || "body"} must be an object.`;
    }

    const unknown = Object.keys(object).filter(
        (key) => !allowedFields.includes(key)
    );

    if (unknown.length > 0) {
        return `Unknown field(s) in ${path || "body"}: ${unknown.join(", ")}`;
    }

    return null;
}

function validateNumberFields(object, fields, path) {
    for (const field of fields) {
        if (
            Object.hasOwn(object, field) &&
            (typeof object[field] !== "number" ||
                !Number.isFinite(object[field]))
        ) {
            return `${path}.${field} must be a valid number.`;
        }
    }

    return null;
}

function validateBooleanFields(object, fields, path) {
    for (const field of fields) {
        if (
            Object.hasOwn(object, field) &&
            typeof object[field] !== "boolean"
        ) {
            return `${path}.${field} must be a boolean.`;
        }
    }

    return null;
}

function validatePolicyBody(body) {
    let error = rejectUnknownFields(body, rootFields);
    if (error) return error;

    error = validateNumberFields(body, numericFields, "body");
    if (error) return error;

    error = validateBooleanFields(body, booleanFields, "body");
    if (error) return error;

    if (Object.hasOwn(body, "scoringWeights")) {
        error = rejectUnknownFields(
            body.scoringWeights,
            weightFields,
            "scoringWeights"
        );
        if (error) return error;

        error = validateNumberFields(
            body.scoringWeights,
            weightFields,
            "scoringWeights"
        );
        if (error) return error;
    }

    if (Object.hasOwn(body, "levels")) {
        error = rejectUnknownFields(
            body.levels,
            levelNames,
            "levels"
        );
        if (error) return error;

        for (const levelName of Object.keys(body.levels)) {
            const level = body.levels[levelName];

            error = rejectUnknownFields(
                level,
                levelFields,
                `levels.${levelName}`
            );
            if (error) return error;

            error = validateNumberFields(
                level,
                levelFields,
                `levels.${levelName}`
            );
            if (error) return error;
        }
    }

    return null;
}

function mergePolicy(existing, body) {
    const merged = {
        eligibilityWindowDays: existing?.eligibilityWindowDays,
        scoringWeights: existing?.scoringWeights?.toObject
            ? existing.scoringWeights.toObject()
            : { ...(existing?.scoringWeights || {}) },
        levels: {},
        maxCreditLimit: existing?.maxCreditLimit,
        maxCreditDueDays: existing?.maxCreditDueDays,
        blockIfOverdue: existing?.blockIfOverdue,
        maxOverdueAmount: existing?.maxOverdueAmount,
        isActive: existing?.isActive
    };

    for (const levelName of levelNames) {
        const currentLevel = existing?.levels?.[levelName];

        merged.levels[levelName] = currentLevel?.toObject
            ? currentLevel.toObject()
            : { ...(currentLevel || {}) };
    }

    for (const [key, value] of Object.entries(body)) {
        if (key === "scoringWeights") {
            merged.scoringWeights = {
                ...merged.scoringWeights,
                ...value
            };
        } else if (key === "levels") {
            for (const [levelName, levelConfig] of Object.entries(value)) {
                merged.levels[levelName] = {
                    ...merged.levels[levelName],
                    ...levelConfig
                };
            }
        } else {
            merged[key] = value;
        }
    }

    return merged;
}

// Get this mill's credit policy.
router.get("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or access denied."
            });
        }

        const policy = await MillCreditPolicy.findOne({ millId });

        if (!policy) {
            return res.status(404).json({
                success: false,
                message: "Credit policy not found."
            });
        }

        return res.status(200).json({
            success: true,
            data: policy
        });
    } catch (error) {
        console.error("Get credit policy error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve credit policy."
        });
    }
}
);

// Create or partially update this mill's credit policy.
router.put("/:millId", protect, requiredRole("owner"), async (req, res) => {
    try {
        const { millId } = req.params;

        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        const mill = await Mill.findOne({
            _id: millId,
            ownerId: req.user.id
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Mill not found or access denied."
            });
        }

        if (
            !req.body ||
            typeof req.body !== "object" ||
            Array.isArray(req.body) ||
            Object.keys(req.body).length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a non-empty JSON object."
            });
        }

        const bodyError = validatePolicyBody(req.body);

        if (bodyError) {
            return res.status(400).json({
                success: false,
                message: bodyError
            });
        }

        let policy = await MillCreditPolicy.findOne({ millId });

        const merged = mergePolicy(policy, req.body);

        if (!policy) {
            policy = new MillCreditPolicy({
                millId,
                ...merged
            });
        } else {
            policy.set(merged);
        }

        await policy.save();

        return res.status(policy.isNew ? 201 : 200).json({
            success: true,
            message: "Credit policy saved successfully.",
            data: policy
        });
    } catch (error) {
        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return res.status(400).json({
                success: false,
                message: "Credit policy validation failed.",
                errors: error.errors
                    ? Object.fromEntries(
                        Object.entries(error.errors).map(
                            ([key, value]) => [key, value.message]
                        )
                    )
                    : error.message
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A credit policy already exists for this mill."
            });
        }

        console.error("Save credit policy error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to save credit policy."
        });
    }
}
);

export default router;
