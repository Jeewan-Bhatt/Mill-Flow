import express from "express";
import Mill from "../models/Mill.js";
import mongoose from "mongoose";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const mill = new Mill(req.body);

        await mill.save();

        res.status(201).json({
            success: true,
            message: "Mill created successfully",
            data: mill,
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message,
        });
    }
});

router.get("/", async(req,res)=>{
    try{
        const mills = await Mill.find();

        res.status(200).json({
            success: true,
            count: mills.length,
            data: mills,
        });
    } catch(error){
        res.status(500).json({
            success: false,
            message: "Failed to fetch mills",
        });
    }
});

router.get("/:id",  async (req,res)=>{
    try{
        if(!mongoose.isValidObjectId(req.params.id)){
            return res.status(400).json({
                success: false,
                message: "invalid mill ID",
            });
        }

        const mill = await Mill.findById(req.params.id);
    
        if(!mill){
            return res.status(404).json({
                success: false,
                message: "Mill not found",
            });
        }

        res.status(200).json({
            success: true,
            data: mill,
        });
    } catch (error){
        res.status(500).json({
            success: false,
            message: "Failed to fetch mill",
        });
    }
});

router.put("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid mill ID",
      });
    }

    const allowedFields = [
      "millName",
      "location",
      "contactNo",
      "services",
      "isActive",
    ];

    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const mill = await Mill.findByIdAndUpdate(
      req.params.id,
      updates,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!mill) {
      return res.status(404).json({
        success: false,
        message: "Mill not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Mill updated successfully",
      data: mill,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
});

router.delete("/:id", async(req,res)=>{
    try{
        if(!mongoose.isValidObjectId(req.params.id)){
            return res.status(400).json({
                success: false,
                message: "Invalid Mill ID",
            });
        }

        const mill = await Mill.findByIdAndDelete(req.params.id);

        if(!mill){
            return res.status(404).json({
                success: false,
                message: "Mill not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Mill deleted successfully",
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete mill",
        });
    }
});


export default router;