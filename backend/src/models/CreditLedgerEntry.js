
import mongoose from "mongoose";

const creditLedgerEntrySchema = new mongoose.Schema(
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

        creditAccountId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MillCreditAccount",
            required: true,
            index: true
        },

        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true
        },

        // Snapshot of the amount charged to credit.
        amount: {
            type: Number,
            required: true,
            min: 0.01
        },

        dueAt: {
            type: Date,
            required: true
        },

        // User who recorded the credit usage.
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        notes: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

// An order can create only one credit charge.
creditLedgerEntrySchema.index(
    { orderId: 1 },
    { unique: true }
);

// Efficient customer debt-history queries.
creditLedgerEntrySchema.index({
    millId: 1,
    customerId: 1,
    createdAt: -1
});

const CreditLedgerEntry = mongoose.model(
    "CreditLedgerEntry",
    creditLedgerEntrySchema
);

export default CreditLedgerEntry;
