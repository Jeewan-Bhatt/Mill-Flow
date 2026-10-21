
import mongoose from "mongoose";

const millSchema = new mongoose.Schema(
    {
        millName: {
            type: String,
            required: true,
            trim: true,
        },

        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: "User",
        },

        location: {
            type: String,
            required: true,
            trim: true,
        },

        contactNo: {
            type: String,
            required: true,
            trim: true,
            match: /^\+?[0-9\s()-]{7,20}$/,
        },

        services: {
            type: [String],
            required: true,
            validate: {
                validator: (services) =>
                    services.length > 0 &&
                    services.every(
                        (service) =>
                            typeof service === "string" &&
                            service.trim().length > 0
                    ),
                message: "At least one valid service is required.",
            },
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

const Mill = mongoose.model("Mill", millSchema);

export default Mill;
