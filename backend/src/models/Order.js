
import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
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

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Booking details
        serviceType: {
            type: String,
            required: true,
            trim: true
        },

        grainType: {
            type: String,
            required: true,
            trim: true
        },

        estimatedWeightKg: {
            type: Number,
            required: true,
            min: 0.01
        },

        customerNotes: {
            type: String,
            trim: true,
            default: ""
        },

        // Price copied from the mill's listed service price
        serviceRate: {
            type: Number,
            required: true,
            min: 0
        },

        rateUnit: {
            type: String,
            enum: ["per_kg", "per_quintal"],
            required: true
        },

        currency: {
            type: String,
            default: "NPR"
        },

        estimatedAmount: {
            type: Number,
            required: true,
            min: 0
        },

        // Grain arrival and queue
        actualWeightKg: {
            type: Number,
            min: 0.01,
            default: null
        },

        arrivedAt: {
            type: Date,
            default: null
        },

        // Processing lifecycle
        status: {
            type: String,
            enum: [
                "booked",
                "queued",
                "processing",
                "completed",
                "rejected",
                "cancelled"
            ],
            default: "booked"
        },

        startedAt: {
            type: Date,
            default: null
        },

        completedAt: {
            type: Date,
            default: null
        },

        finalAmount: {
            type: Number,
            min: 0,
            default: null
        },

        rejectedAt: {
            type: Date,
            default: null
        },

        rejectionReason: {
            type: String,
            trim: true,
            default: ""
        },

        cancelledAt: {
            type: Date,
            default: null
        },

        cancellationReason: {
            type: String,
            trim: true,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

// Customer order history
orderSchema.index({
    customerId: 1,
    createdAt: -1
});

// Mill queue: oldest arrived order first
orderSchema.index({
    millId: 1,
    status: 1,
    arrivedAt: 1
});

const Order = mongoose.model("Order", orderSchema);

export default Order;
