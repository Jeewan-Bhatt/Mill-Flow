
import mongoose from "mongoose";

const customerSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true
        },

        name: {
            type: String,
            required: true,
            trim: true,
            minlength: 2,
            maxlength: 100
        },

        phone: {
            type: String,
            required: true,
            trim: true,
            match: /^[0-9+\-\s()]{7,20}$/
        },

        address: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

const Customer = mongoose.model("Customer", customerSchema);

export default Customer;
