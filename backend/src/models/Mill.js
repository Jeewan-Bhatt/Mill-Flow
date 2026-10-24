
import mongoose from "mongoose";

const servicePricingSchema = new mongoose.Schema(
    {
        serviceType: {
            type: String,
            required: true,
            trim: true
        },

        rate: {
            type: Number,
            required: true,
            min: 0
        },

        rateUnit: {
            type: String,
            enum: ["per_kg", "per_quintal"],
            required: true
        }
    },
    { _id: false }
);

const millSchema = new mongoose.Schema(
    {
        millName: {
            type: String,
            required: true,
            trim: true
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "User"
        },

        location: {
            type: String,
            required: true,
            trim: true
        },

        contactNo: {
            type: String,
            required: true,
            trim: true,
            match: /^\+?[0-9\s()-]{7,20}$/
        },

        servicePricing: {
            type: [servicePricingSchema],
            required: true,
            validate: {
                validator: (pricing) => {
                    if (!pricing || pricing.length === 0) {
                        return false;
                    }

                    const serviceTypes = pricing.map(
                        (item) => item.serviceType
                    );

                    return (
                        serviceTypes.every(
                            (service) =>
                                typeof service === "string" &&
                                service.trim().length > 0
                        ) &&
                        new Set(serviceTypes).size === serviceTypes.length
                    );
                },
                message:
                    "Provide at least one valid service with no duplicate service types."
            }
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

const Mill = mongoose.model("Mill", millSchema);

export default Mill;
