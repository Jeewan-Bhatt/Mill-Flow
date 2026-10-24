import mongoose from "mongoose";
import Mill from "./models/Mill.js";

const testMill = new Mill({
  millName: "ABC Mill",
  ownerId: new mongoose.Types.ObjectId(),
  location: "dehradun, UK",
  contactNo: "9800000000",
  servicePricing: [
    {
      serviceType: "paddy_processing",
      rate: 5,
      rateUnit: "per_kg"
    },
    {
      serviceType: "wheat_grinding",
      rate: 200,
      rateUnit: "per_quintal"
    }
  ],
});

try {
  await testMill.validate();

  console.log("Mill schema validation successful!");
  console.log(testMill.toObject());
} catch (error) {
  console.log("Validation failed:", error.message);
}