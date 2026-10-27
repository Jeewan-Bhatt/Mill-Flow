
import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        // Purpose of the transaction.
        // Default preserves compatibility with older payment records.
        type: {
            type: String,
            enum: ["order_payment", "credit_repayment"],
            default: "order_payment",
            required: true
        },

        // Required for order payments.
        // Credit repayments can be allocated across multiple orders.
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null,
            index: true
        },

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

        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        amount: {
            type: Number,
            required: true,
            min: 0.01
        },

        method: {
            type: String,
            enum: [
                "cash",
                "bank_transfer",
                "digital_wallet",
                "online_payment",
                "other"
            ],
            required: true
        },

        status: {
            type: String,
            enum: [
                "pending_verification",
                "verified",
                "rejected"
            ],
            default: "pending_verification",
            required: true
        },

        // External gateway/bank transaction reference.
        providerReference: {
            type: String,
            trim: true,
            default: ""
        },

        reference: {
            type: String,
            trim: true,
            default: ""
        },

        notes: {
            type: String,
            trim: true,
            default: ""
        },

        paidAt: {
            type: Date,
            default: null
        },

        verifiedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Retrieve payment history for an order.
paymentSchema.index({
    orderId: 1,
    createdAt: -1
});

// Retrieve payment history for a customer at a mill.
paymentSchema.index({
    millId: 1,
    customerId: 1,
    createdAt: -1
});

// Validate the relationship between transaction purpose and order.
paymentSchema.pre("validate", function () {
    if (this.type === "order_payment" && !this.orderId) {
        this.invalidate(
            "orderId",
            "Order payments must reference an order."
        );
    }

    if (this.type === "credit_repayment" && this.orderId) {
        this.invalidate(
            "orderId",
            "Credit repayments must use repayment allocations, not an orderId."
        );
    }
});

const Payment = mongoose.model("Payment", paymentSchema);

export default Payment;
