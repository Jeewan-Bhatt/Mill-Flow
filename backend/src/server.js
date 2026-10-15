import express from "express";
import dotenv from "dotenv";
import connectDB from "./db.js";
import millRoutes from "./routes/millRoutes.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use("/api/mills", millRoutes);

app.get("/api/health", (req,res)=>{
    res.json({
        success: true,
        message: "MillFlow API is running"
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
