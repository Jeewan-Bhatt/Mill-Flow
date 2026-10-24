import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import mongoose from "mongoose";

import Customer from "../models/Customer.js";
import User from "../models/User.js";
import Mill from "../models/Mill.js";

dotenv.config();

const router = express.Router();

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phoneRegex = /^[9][678][0-9]{8}$/;
const millContactRegex = /^\+?[0-9\s()-]{7,20}$/;

const allowedServices = [
    "paddy_processing",
    "wheat_grinding",
    "other_grains",
];

const getDuplicateField = (error) => {
    const fields = Object.keys(error.keyPattern ?? {});

    if (fields.includes("email")) return "email";
    if (fields.includes("phone")) return "phone";

    return null;
};

const duplicateMessage = (field) => {
    if (field === "phone") {
        return "An account with this phone number already exists.";
    }

    if (field === "email") {
        return "An account with this email already exists.";
    }

    return "An account with these details already exists.";
};

// PUBLIC CUSTOMER REGISTRATION + CUSTOMER PROFILE CREATION
router.post("/register", async (req, res) => {
    const { name, email, phone, password } = req.body;

    if (
        !name?.trim() ||
        !email?.trim() ||
        !phone?.trim() ||
        !password
    ) {
        return res.status(400).json({
            success: false,
            message: "Name, email, phone, and password are required.",
        });
    }

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^9[678][0-9]{8}$/;

    if (normalizedName.length < 2 || normalizedName.length > 100) {
        return res.status(400).json({
            success: false,
            message: "Name must be between 2 and 100 characters.",
        });
    }

    if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
            success: false,
            message: "Please provide a valid email address.",
        });
    }

    if (!phoneRegex.test(normalizedPhone)) {
        return res.status(400).json({
            success: false,
            message: "Please provide a valid 10-digit Nepali mobile number.",
        });
    }

    if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({
            success: false,
            message: "Password must be at least 8 characters long.",
        });
    }

    const session = await mongoose.startSession();

    try {
        let createdUser;

        await session.withTransaction(async () => {
            const existingUser = await User.findOne({
                $or: [
                    { email: normalizedEmail },
                    { phone: normalizedPhone },
                ],
            }).session(session);

            if (existingUser) {
                const duplicateField =
                    existingUser.email === normalizedEmail
                        ? "email"
                        : "phone";

                const error = new Error(
                    `An account with this ${duplicateField} already exists.`
                );
                error.statusCode = 409;
                throw error;
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const [user] = await User.create(
                [
                    {
                        name: normalizedName,
                        email: normalizedEmail,
                        phone: normalizedPhone,
                        password: hashedPassword,
                        role: "customer",
                    },
                ],
                { session }
            );

            await Customer.create(
                [
                    {
                        userId: user._id,
                    },
                ],
                { session }
            );

            createdUser = {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
            };
        });

        return res.status(201).json({
            success: true,
            message: "Customer account and profile created successfully.",
            user: createdUser,
        });
    } catch (error) {
        if (error.statusCode === 409 || error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    error.statusCode === 409
                        ? error.message
                        : "An account with this email or phone already exists.",
            });
        }

        console.error("Customer registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to register right now. Please try again.",
        });
    } finally {
        await session.endSession();
    }
});

// LOGIN WITH EMAIL OR PHONE
router.post("/login", async (req, res) => {
    try {
        const { identifier, password } = req.body ?? {};

        if (
            typeof identifier !== "string" ||
            !identifier.trim() ||
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Email or phone number and password are required.",
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is missing.");

            return res.status(500).json({
                success: false,
                message: "Server configuration error.",
            });
        }

        const normalizedIdentifier = identifier.trim();

        let userQuery;

        if (emailRegex.test(normalizedIdentifier)) {
            userQuery = {
                email: normalizedIdentifier.toLowerCase(),
            };
        } else if (phoneRegex.test(normalizedIdentifier)) {
            userQuery = {
                phone: normalizedIdentifier,
            };
        } else {
            return res.status(400).json({
                success: false,
                message:
                    "Enter a valid email address or 10-digit Nepali phone number.",
            });
        }

        const user = await User.findOne(userQuery).select("+password");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/phone or password.",
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                success: false,
                message: "Invalid email/phone or password.",
            });
        }

        const token = jwt.sign(
            {
                sub: user._id.toString(),
                role: user.role,
            },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful.",
            token,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error.",
        });
    }
});

// OWNER REGISTRATION + FIRST MILL
router.post("/register-owner", async (req, res) => {
    let session;

    try {
        const { owner, mill } = req.body ?? {};

        if (
            !owner ||
            typeof owner.name !== "string" ||
            owner.name.trim().length < 2 ||
            owner.name.trim().length > 100 ||
            typeof owner.email !== "string" ||
            !emailRegex.test(owner.email.trim()) ||
            typeof owner.phone !== "string" ||
            !phoneRegex.test(owner.phone.trim()) ||
            typeof owner.password !== "string" ||
            owner.password.length < 8
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Provide a valid owner name, email, phone number, and password of at least 8 characters.",
            });
        }

        const email = owner.email.trim().toLowerCase();
        const phone = owner.phone.trim();

        if (
            !mill ||
            typeof mill.millName !== "string" ||
            !mill.millName.trim() ||
            typeof mill.location !== "string" ||
            !mill.location.trim() ||
            typeof mill.contactNo !== "string" ||
            !millContactRegex.test(mill.contactNo.trim()) ||
            !Array.isArray(mill.servicePricing) ||
            mill.servicePricing.length === 0 ||
            !mill.servicePricing.every(
                (service) =>
                    service &&
                    typeof service.serviceType === "string" &&
                    allowedServices.includes(service.serviceType) &&
                    typeof service.rate === "number" &&
                    Number.isFinite(service.rate) &&
                    service.rate >= 0 &&
                    ["per_kg", "per_quintal"].includes(service.rateUnit)
            ) ||
            new Set(
                mill.servicePricing.map((service) => service.serviceType)
            ).size !== mill.servicePricing.length
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Provide valid mill details and pricing for at least one service"
            });
        }

        //if user with the email or phone already exists
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }],
        }).select("_id email phone");

        if (existingUser) {
            const field =
                existingUser.email === email ? "email" : "phone";

            return res.status(409).json({
                success: false,
                message: duplicateMessage(field),
            });
        }

        const hashedPassword = await bcrypt.hash(owner.password, 12);

        session = await mongoose.startSession();

        let createdOwner;
        let createdMill;

        await session.withTransaction(async () => {
            createdOwner = new User({
                name: owner.name.trim(),
                email,
                phone,
                password: hashedPassword,
                role: "owner",
            });

            await createdOwner.save({ session });

            createdMill = new Mill({
                millName: mill.millName.trim(),
                ownerId: createdOwner._id,
                location: mill.location.trim(),
                contactNo: mill.contactNo.trim(),
                servicePricing: mill.servicePricing.map((service) => ({
                    serviceType: service.serviceType,
                    rate: service.rate,
                    rateUnit: service.rateUnit,
                })),
            });

            await createdMill.save({ session });
        });

        return res.status(201).json({
            success: true,
            message:
                "Owner account and first mill registered successfully.",
            owner: {
                id: createdOwner._id,
                name: createdOwner.name,
                email: createdOwner.email,
                phone: createdOwner.phone,
                role: createdOwner.role,
            },
            mill: {
                id: createdMill._id,
                millName: createdMill.millName,
                location: createdMill.location,
                contactNo: createdMill.contactNo,
                servicePricing: createdMill.servicePricing,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            const field = getDuplicateField(error);

            return res.status(409).json({
                success: false,
                message: duplicateMessage(field),
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Invalid owner or mill details.",
            });
        }

        console.error("Owner registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Could not register the owner and mill.",
        });
    } finally {
        if (session) {
            await session.endSession();
        }
    }
});

export default router;
