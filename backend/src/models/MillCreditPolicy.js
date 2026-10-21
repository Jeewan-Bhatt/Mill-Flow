import mongoose from "mongoose";

const millCreditPolicySchema = new mongoose.Schema(
    {
        millId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mill",
            required: true,
            unique: true,
            index: true
        },

        //Minimum verified business activity 
        minTransactionValue: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },

        minGrainWeightKg: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },

        // Minimum age of the customer–mill relationship
        minRelationshipDays: {
            type: Number,
            required: true,
            min: 0,
            default: 90
        },

        // Minimum proportion of due payments paid on time
        minOnTimePaymentRate: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
            default: 90
        },

        // Whether any overdue debt blocks eligibility
        blockIfOverdue: {
            type: Boolean,
            default: true
        },

        // Maximum overdue amount allowed when blocking is disabled
        maxOverdueAmount: {
            type: Number,
            min: 0,
            default: 0
        },

        // Hard cap for credit recommendations at this mill
        maxCreditLimit: {
            type: Number,
            required: true,
            min: 0
        },

        // Maximum permitted repayment period
        maxCreditDueDays: {
            type: Number,
            required: true,
            min: 1,
            max: 365,
            default: 30
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

const MillCreditPolicy = mongoose.model("MillCreditPolicy", millCreditPolicySchema);

export default MillCreditPolicy;