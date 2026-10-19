import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/user.js";

import mongoose from "mongoose";
import Mill from "../models/Mill.js";

dotenv.config();

const router = express.Router();

router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        //Validate required fields
        if (
            typeof name !== "string" || !name.trim() ||
            typeof email !== "string" || !email.trim() ||
            typeof password !== "string" || password.length < 8
        ) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required. Password must be at least 8-characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        //check whether the email already exists
        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists"
            });
        }

        //Hash the password
        const hashedPassword = await bcrypt.hash(password, 12);

        //Create the user
        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "customer"
        });

        //Send a safe response
        return res.status(201).json({
            success: true,
            message: "Account created successfully.",
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        //Handle duplicate-email race conditions
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists."
            })
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: "Invalid registration details."
            })
        }

        console.error("Registration error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

router.post("/login", async(req,res)=>{
    try{
        const{email,password} = req.body;

        if(
            typeof email !=="string" || !email.trim() ||
            typeof password !== "string" || !password
        ){
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        if(!process.env.JWT_SECRET){
            console.log("JWT_SECRET is missing.");

            return res.status(500).json({
                success: false,
                message: "Server configuration error."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        }).select("+password"); 
        //Mongoose don't generally return the select:false key-value pairs declared in schema. so .select("+password") helps return it

        if(!user){
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if(!passwordMatches){
            return res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                sub: user._id.toString(),
                role: user.role
            },
            process.env.JWT_SECRET,
            {expiresIn: "1h"}
        );

        return res.status(200).json({
            success: true,
            message: "Login Successful.",
            token,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error."
        });
    }
});

router.post("/register-owner", async (req, res) => {
    let session;

    try {
        const { owner, mill } = req.body ?? {};

        // Validate owner details
        if (
            !owner ||
            typeof owner.name !== "string" ||
            typeof owner.email !== "string" ||
            typeof owner.password !== "string" ||
            !owner.name.trim() ||
            !owner.email.trim() ||
            owner.password.length < 8
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a valid owner name, email, and password of at least 8 characters.",
            });
        }

        const email = owner.email.trim().toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid email address.",
            });
        }

        // Validate first mill details
        const allowedServices = [
            "paddy_processing",
            "wheat_grinding",
            "other_grains",
        ];

        if (
            !mill ||
            typeof mill.millName !== "string" ||
            !mill.millName.trim() ||
            typeof mill.location !== "string" ||
            !mill.location.trim() ||
            typeof mill.contactNo !== "string" ||
            !/^[0-9+\-\s()]{7,20}$/.test(mill.contactNo.trim()) ||
            !Array.isArray(mill.services) ||
            mill.services.length === 0 ||
            !mill.services.every(
                (service) => allowedServices.includes(service)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide valid details for the first mill and its services.",
            });
        }

        // Check whether the email is already registered
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(owner.password, 12);

        // Create owner and mill in one database transaction
        session = await mongoose.startSession();

        let createdOwner;
        let createdMill;

        await session.withTransaction(async () => {
            createdOwner = new User({
                name: owner.name.trim(),
                email,
                password: hashedPassword,
                role: "owner",
            });

            await createdOwner.save({ session });

            createdMill = new Mill({
                millName: mill.millName.trim(),
                ownerId: createdOwner._id,
                location: mill.location.trim(),
                contactNo: mill.contactNo.trim(),
                services: [...new Set(mill.services)],
            });

            await createdMill.save({ session });
        });

        return res.status(201).json({
            success: true,
            message: "Owner account and first mill registered successfully.",
            owner: {
                id: createdOwner._id,
                name: createdOwner.name,
                email: createdOwner.email,
                role: createdOwner.role,
            },
            mill: {
                id: createdMill._id,
                millName: createdMill.millName,
                location: createdMill.location,
                services: createdMill.services,
            },
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "An account with this email already exists.",
            });
        }

        console.error("Owner registration error:", error.message);

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