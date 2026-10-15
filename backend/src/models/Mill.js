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
        },

        services: {
            type: [String],
            required: true,
        },

        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {timestamps: true}
);

const Mill = mongoose.model("Mill", millSchema);

export default Mill;