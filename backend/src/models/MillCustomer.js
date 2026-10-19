import mongoose from "mongoose";

const millCustomerSchema = new mongoose.Schema(
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

        isPermanent: {
            type: Boolean,
            default: false
        },

        creditRequestStatus: {
            type: String,
            enum: ["not_requested", "pending", "approved", "rejected"],
            default: "not_requested",
            required: true
        },

        creditDueDays: {
            type: Number,
            default: 0,
            min: 0,
            max: 365
        }
    },
    {
        timestamps: true
    }
);

millCustomerSchema.index(
    { millId: 1, customerId: 1 },
    { unique: true }
);

const MillCustomer = mongoose.model("MillCustomer", millCustomerSchema);

export default MillCustomer;