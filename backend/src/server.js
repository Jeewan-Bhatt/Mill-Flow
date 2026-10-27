import express from "express";
import dotenv from "dotenv";

import connectDB from "./db.js";

import paymentRoutes from "./routes/paymentRoutes.js";
import millRoutes from "./routes/millRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import membershipRoutes from "./routes/membershipRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import creditPolicyRoutes from "./routes/creditPolicyRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";

import { protect } from "./middleware/authMiddleware.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use("/api/mills", millRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/memberships", membershipRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/credit-policies", creditPolicyRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);

app.get("/api/health", (req,res)=>{
    res.json({
        success: true,
        message: "MillFlow API is running"
    });
});

app.get("/api/auth/me", protect, (req, res) => {
    res.status(200).json({
        success: true,
        user: req.user
    });
});

const PORT = process.env.PORT || 5000;

const startServer = async()=>{
    await connectDB();

    app.listen(PORT, () => {
        console.log(`MillFlow API is running on port ${PORT}`);
    });
};

startServer();
