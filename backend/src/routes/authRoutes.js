import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import User from "../models/user.js";

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

export default router;