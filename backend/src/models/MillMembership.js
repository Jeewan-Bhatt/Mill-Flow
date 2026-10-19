import mongoose from "mongoose";

const millMembershipSchema = new mongoose.Schema(
    {
        millId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mill",
            required: true,
            index: true
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        role: {
            type: String,
            enum: ["staff"],
            default: "staff",
            required: true
        },

        status: {
            type: String,
            enum: ["pending", "active", "rejected", "removed"],
            default: "pending",
            required: true
        },

        requestedAt: {
            type: Date,
            default: Date.now
        },

        approvedAt: {
            type: Date,
            default: null
        },
        
        removedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

millMembershipSchema.index(
    { millId: 1, userId: 1 },
    { unique: true }
);

const MillMembership = mongoose.model(
    "MillMembership",
    millMembershipSchema
);

export default MillMembership;