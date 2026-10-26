
import mongoose from "mongoose";

const millCreditAccountSchema = new mongoose.Schema(
    {
        millId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mill",
            required: true
        },

        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true
        },

        // Every customer starts at Level 0 with no credit.
        creditLevel: {
            type: Number,
            enum: [0, 1, 2, 3],
            default: 0,
            required: true
        },

        creditStatus: {
            type: String,
            enum: [
                "not_requested",
                "pending",
                "approved",
                "rejected",
                "suspended"
            ],
            default: "not_requested",
            required: true
        },

        // The actual limit approved by the mill owner.
        approvedLimit: {
            type: Number,
            min: 0,
            default: 0,
            required: true
        },

        creditDueDays: {
            type: Number,
            min: 0,
            max: 365,
            default: 0,
            required: true
        },

        requestedLevel: {
            type: Number,
            enum: [1, 2, 3],
            default: null
        },

        requestedAt: {
            type: Date,
            default: null
        },

        lastEligibilityScore: {
            type: Number,
            min: 0,
            max: 100,
            default: null
        },

        lastSuggestedLimit: {
            type: Number,
            min: 0,
            default: null
        },

        lastEligibilityCheckAt: {
            type: Date,
            default: null
        },

        approvedAt: {
            type: Date,
            default: null
        },

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        rejectedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null
        },

        reapplyAfter: {
            type: Date,
            default: null
        },

        lastReviewedAt: {
            type: Date,
            default: null
        },

        lastReviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        reviewNote: {
            type: String,
            trim: true,
            maxlength: 500,
            default: null
        }
    },
    { timestamps: true }
);

// Exactly one credit account per customer at each mill.
millCreditAccountSchema.index(
    { millId: 1, customerId: 1 },
    { unique: true }
);

// Enforce basic account rules.
millCreditAccountSchema.pre("validate", function () {
    if (this.creditLevel === 0 && this.approvedLimit !== 0) {
        this.invalidate(
            "approvedLimit",
            "Level 0 customers cannot have an approved credit limit."
        );
    }

    if (this.creditLevel === 0 && this.creditDueDays !== 0) {
        this.invalidate(
            "creditDueDays",
            "Level 0 customers cannot have a credit repayment period."
        );
    }

    if (this.creditStatus === "approved") {
        if (this.creditLevel === 0) {
            this.invalidate(
                "creditLevel",
                "Approved credit requires Level 1, 2, or 3."
            );
        }

        if (this.approvedLimit <= 0) {
            this.invalidate(
                "approvedLimit",
                "Approved credit requires a positive limit."
            );
        }

        if (this.creditDueDays < 1) {
            this.invalidate(
                "creditDueDays",
                "Approved credit requires a repayment period."
            );
        }

        if (!this.approvedBy || !this.approvedAt) {
            this.invalidate(
                "approvedBy",
                "Approval must record who approved it and when."
            );
        }
    }

    if (
        this.creditStatus === "rejected" &&
        !this.rejectionReason
    ) {
        this.invalidate(
            "rejectionReason",
            "A rejection reason is required."
        );
    }
});

const MillCreditAccount = mongoose.model(
    "MillCreditAccount",
    millCreditAccountSchema
);

export default MillCreditAccount;
