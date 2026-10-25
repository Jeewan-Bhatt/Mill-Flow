
import mongoose from "mongoose";

//defines how much each performance factor contributes to the 100-point score.
const scoringWeightsSchema = new mongoose.Schema(
    {
        transactionValue: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 20
        },
        grainWeight: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 15
        },
        relationshipDuration: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 15
        },
        onTimePaymentRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 25
        },
        fullyRepaidCreditUsage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 25
        }
    },
    { _id: false }
);

//defines the requirements and maximum limit for each individual credit level.
const creditLevelSchema = new mongoose.Schema(
    {
        maxCreditLimit: {
            type: Number,
            required: true,
            min: 0
        },
        pointsThreshold: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        minTransactionValue: {
            type: Number,
            required: true,
            min: 0
        },
        minGrainWeightKg: {
            type: Number,
            required: true,
            min: 0
        },
        minRelationshipDays: {
            type: Number,
            required: true,
            min: 0
        },
        minOnTimePaymentRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        },
        minFullyRepaidCreditUsage: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { _id: false }
);

//main
const millCreditPolicySchema = new mongoose.Schema(
    {
        millId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mill",
            required: true,
            unique: true
        },

        eligibilityWindowDays: {
            type: Number,
            required: true,
            min: 1,
            max: 365,
            default: 90
        },

        scoringWeights: {
            type: scoringWeightsSchema,
            required: true,
            default: () => ({})
        },

        levels: {
            level1: {
                type: creditLevelSchema,
                required: true
            },
            level2: {
                type: creditLevelSchema,
                required: true
            },
            level3: {
                type: creditLevelSchema,
                required: true
            }
        },

        // Mill-wide hard cap across all credit levels
        maxCreditLimit: {
            type: Number,
            required: true,
            min: 0
        },

        maxCreditDueDays: {
            type: Number,
            required: true,
            min: 1,
            max: 365,
            default: 30
        },

        blockIfOverdue: {
            type: Boolean,
            default: true
        },

        maxOverdueAmount: {
            type: Number,
            min: 0,
            default: 0
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

// Validate scoring weights and level limits together.
millCreditPolicySchema.pre("validate", function () {
    const weights = this.scoringWeights;

    if (weights) {
        const total =
            weights.transactionValue +
            weights.grainWeight +
            weights.relationshipDuration +
            weights.onTimePaymentRate +
            weights.fullyRepaidCreditUsage;

        if (total !== 100) {
            this.invalidate(
                "scoringWeights",
                "Scoring weights must total exactly 100."
            );
        }
    }

    if (this.levels && this.maxCreditLimit != null) {
        for (const levelName of ["level1", "level2", "level3"]) {
            const level = this.levels[levelName];

            if (
                level &&
                level.maxCreditLimit > this.maxCreditLimit
            ) {
                this.invalidate(
                    `levels.${levelName}.maxCreditLimit`,
                    "A level limit cannot exceed the mill-wide maximum."
                );
            }
        }
    }
});

const MillCreditPolicy = mongoose.model(
    "MillCreditPolicy",
    millCreditPolicySchema
);

export default MillCreditPolicy;
