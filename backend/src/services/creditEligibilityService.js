
import mongoose from "mongoose";
import Order from "../models/Order.js";
import MillCustomer from "../models/MillCustomer.js";
import MillCreditPolicy from "../models/MillCreditPolicy.js";

const LEVEL_NAMES = {
    1: "level1",
    2: "level2",
    3: "level3"
};

//create custom error
function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

//calculates how many points customer earns for a particular metric
function calculatePoints(actual, required, weight) {
    if (required === 0) {
        return weight;
    }

    return weight * Math.min(actual / required, 1);
}

//rounds an amount down to two decimal places
function roundDownToTwoDecimals(amount) {
    return Math.floor((amount + Number.EPSILON) * 100) / 100;
}

// main function
export async function evaluateCreditEligibility({
    millId,
    customerId,
    targetLevel
}) {
    // 1. Validate input.
    if (
        !mongoose.isValidObjectId(millId) ||
        !mongoose.isValidObjectId(customerId)
    ) {
        throw createError("Invalid mill ID or customer ID.");
    }

    if (![1, 2, 3].includes(Number(targetLevel))) {
        throw createError("Target level must be 1, 2, or 3.");
    }

    targetLevel = Number(targetLevel);  //convert the datatype to number

    // 2. Load the mill's policy.
    const policy = await MillCreditPolicy.findOne({ millId });

    if (!policy) {
        throw createError("Credit policy not found.", 404);
    }

    if (!policy.isActive) {
        throw createError(
            "This mill's credit policy is inactive.",
            409
        );
    }

    //retrieves the rules for the requested level
    const levelPolicy = policy.levels[LEVEL_NAMES[targetLevel]];

    if (!levelPolicy) {
        throw createError(
            "The requested credit level is not configured.",
            409
        );
    }

    // 3. Confirm the customer has a relationship with this mill.
    const relationship = await MillCustomer.findOne({
        millId,
        customerId
    });

    if (!relationship) {
        throw createError(
            "The customer must establish a relationship with this mill first.",
            409
        );
    }

    // 4. Calculate the rolling activity window.
    const now = new Date();

    const windowStart = new Date(now);

    windowStart.setDate(
        windowStart.getDate() - policy.eligibilityWindowDays
    );

    // 5. Only completed orders with actual recorded values count.
    const completedOrders = await Order.find({
        millId,
        customerId,
        status: "completed",
        completedAt: { $gte: windowStart, $lte: now }
    })
        .select("finalAmount actualWeightKg completedAt")
        .lean();

    const transactionValue = completedOrders.reduce(
        (total, order) => total + (order.finalAmount ?? 0),
        0
    );

    const grainWeightKg = completedOrders.reduce(
        (total, order) => total + (order.actualWeightKg ?? 0),
        0
    );

    const relationshipDays = Math.max(
        0,
        Math.floor(
            (now.getTime() - relationship.createdAt.getTime()) /
            (1000 * 60 * 60 * 24)
        )
    );

    // 6. Evaluate criteria independently of the points score.
    const criteria = {
        transactionValue: {
            actual: transactionValue,
            required: levelPolicy.minTransactionValue,
            passed:
                transactionValue >= levelPolicy.minTransactionValue
        },

        grainWeight: {
            actual: grainWeightKg,
            required: levelPolicy.minGrainWeightKg,
            passed:
                grainWeightKg >= levelPolicy.minGrainWeightKg
        },

        relationshipDuration: {
            actual: relationshipDays,
            required: levelPolicy.minRelationshipDays,
            passed:
                relationshipDays >= levelPolicy.minRelationshipDays
        },

        onTimePaymentRate: {
            actual: null,
            required: levelPolicy.minOnTimePaymentRate,
            passed: false,
            status: "unavailable",
            reason: "Verified repayment history is not yet implemented."
        },

        fullyRepaidCreditUsage: {
            actual: null,
            required: levelPolicy.minFullyRepaidCreditUsage,
            passed: levelPolicy.minFullyRepaidCreditUsage === 0,
            status:
                levelPolicy.minFullyRepaidCreditUsage === 0
                    ? "not_required"
                    : "unavailable"
        },

        overdueCheck: {
            actual: null,
            passed: false,
            status: "unavailable",
            reason: "Outstanding and overdue balances require the financial ledger."
        }
    };

    // 7. Calculate a provisional score.
    // Unavailable metrics earn no points; they never count as passed.
    const weights = policy.scoringWeights;

    const score =
        calculatePoints(
            transactionValue,
            levelPolicy.minTransactionValue,
            weights.transactionValue
        ) +
        calculatePoints(
            grainWeightKg,
            levelPolicy.minGrainWeightKg,
            weights.grainWeight
        ) +
        calculatePoints(
            relationshipDays,
            levelPolicy.minRelationshipDays,
            weights.relationshipDuration
        );

    const eligibilityScore = Math.round(score * 100) / 100;

    // 8. Do not approve or recommend credit until every required
    // criterion and financial safety check is verifiable.
    const mandatoryCriteriaPassed = Object.values(criteria).every(
        (criterion) => criterion.passed
    );

    const scoreThresholdPassed =
        eligibilityScore >= levelPolicy.pointsThreshold;

    const eligible =
        mandatoryCriteriaPassed && scoreThresholdPassed;

    const levelMaximum = Math.min(
        levelPolicy.maxCreditLimit,
        policy.maxCreditLimit
    );

    const suggestedLimit = eligible
        ? roundDownToTwoDecimals(
            levelMaximum * (eligibilityScore / 100)
        )
        : 0;

    return {
        millId,
        customerId,
        targetLevel,
        evaluatedAt: now,
        eligibilityWindowDays: policy.eligibilityWindowDays,

        activity: {
            completedOrderCount: completedOrders.length,
            transactionValueNPR: transactionValue,
            grainWeightKg,
            relationshipDays
        },

        eligibilityScore,
        pointsThreshold: levelPolicy.pointsThreshold,
        scoreThresholdPassed,
        mandatoryCriteriaPassed,
        eligible,

        suggestedLimitNPR: suggestedLimit,

        criteria,

        limitations: [
            "Repayment performance requires a verified repayment ledger.",
            "Overdue status requires reliable outstanding-balance records.",
            "Owner approval is required before any credit is granted."
        ]
    };
}
