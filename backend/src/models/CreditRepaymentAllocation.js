
import mongoose from "mongoose";

const creditRepaymentAllocationSchema = new mongoose.Schema(
    {
        millId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mill",
            required: true,
            index: true
        },

        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
            index: true
        },

        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Payment",
            required: true
        },

        creditLedgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "CreditLedgerEntry",
            required: true
        },

        // Amount of this repayment applied to this credit charge.
        amount: {
            type: Number,
            required: true,
            min: 0.01
        },

        allocatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        allocatedAt: {
            type: Date,
            default: Date.now,
            required: true
        }
    },
    {
        timestamps: true
    }
);

// Prevent the same payment from being allocated twice
// to the same credit charge.
creditRepaymentAllocationSchema.index(
    { paymentId: 1, creditLedgerEntryId: 1 },
    { unique: true }
);

// Efficient repayment history queries.
creditRepaymentAllocationSchema.index({
    millId: 1,
    customerId: 1,
    allocatedAt: -1
});

const CreditRepaymentAllocation = mongoose.model(
    "CreditRepaymentAllocation",
    creditRepaymentAllocationSchema
);

export default CreditRepaymentAllocation;
