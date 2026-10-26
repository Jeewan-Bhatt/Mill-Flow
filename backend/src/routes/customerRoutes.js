
import express from "express";
import mongoose from "mongoose";
import Customer from "../models/Customer.js";
import Mill from "../models/Mill.js";
import MillCustomer from "../models/MillCustomer.js";
import MillCreditAccount from "../models/MillCreditAccount.js";
import { protect } from "../middleware/authMiddleware.js";
import { requiredRole } from "../middleware/roleMiddleware.js";
import { evaluateCreditEligibility } from "../services/creditEligibilityService.js";

const router = express.Router();

//GET customer profile
router.get("/me", protect, requiredRole("customer"), async (req, res) => {
    try {
        const customer = await Customer.findOne({
            userId: req.user.id,
        }).populate("userId", "name email phone role");

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Customer profile not found.",
            });
        }

        return res.status(200).json({
            success: true,
            customer: {
                id: customer._id,
                name: customer.userId.name,
                email: customer.userId.email,
                phone: customer.userId.phone,
                role: customer.userId.role,
                address: customer.address,
                createdAt: customer.createdAt,
            },
        });
    } catch (error) {
        console.error("Get customer profile error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve customer profile.",
        });
    }
}
);

//Create Mill-Customer relationship
router.post("/mills/:millId/relationship", protect, requiredRole("customer"), async (req, res) => {
    try {
        const { millId } = req.params;

        //Validate the millId
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        //find the customer's profile
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Create your customer profile first."
            });
        }

        //Insure the mill exists and is active
        const mill = await Mill.findOne({
            _id: millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found."
            });
        }

        //Return an existing relationship if one exists
        let relationship = await MillCustomer.findOne({
            millId: mill._id,
            customerId: customer._id
        });

        if (relationship) {
            return res.status(200).json({
                success: true,
                message: "Customer-mill relationship already exists.",
                relationship
            });
        }

        //create the relationship
        relationship = await MillCustomer.create({
            millId: mill._id,
            customerId: customer._id
        });

        return res.status(201).json({
            success: true,
            message: "Customer-mill relationship created successfully.",
            relationship
        });

    } catch (error) {
        if (error.code === 11000) {
            try {
                const customer = await Customer.findOne({
                    userId: req.user.id,
                });

                if (customer) {
                    const relationship = await MillCustomer.findOne({
                        millId: req.params.millId,
                        customerId: customer._id,
                    });

                    if (relationship) {
                        return res.status(200).json({
                            success: true,
                            message: "Customer-mill relationship already exists.",
                            relationship,
                        });
                    }
                }
            } catch (lookupError) {
                console.error(
                    "Duplicate relationship recovery error:",
                    lookupError.message
                );
            }
        }

        console.error(
            "Create customer-mill relationship error:",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "Unable to create customer-mill relationship.",
        });
    }
})

//customer credit request endpoint
router.patch("/mills/:millId/credit-request", protect, requiredRole("customer"), async (req, res) => {
    try {
        const { millId } = req.params;
        const targetLevel = Number(req.body?.targetLevel);

        // 1. Validate request input.
        if (!mongoose.isValidObjectId(millId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mill ID."
            });
        }

        if (![1, 2, 3].includes(targetLevel)) {
            return res.status(400).json({
                success: false,
                message: "targetLevel must be 1, 2, or 3."
            });
        }

        // 2. Find the authenticated customer's profile.
        const customer = await Customer.findOne({
            userId: req.user.id
        });

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: "Create your customer profile first."
            });
        }

        // 3. Confirm the mill is active.
        const mill = await Mill.findOne({
            _id: millId,
            isActive: true
        });

        if (!mill) {
            return res.status(404).json({
                success: false,
                message: "Active mill not found."
            });
        }

        // 4. Confirm the customer has a relationship with this mill.
        const relationship = await MillCustomer.findOne({
            millId: mill._id,
            customerId: customer._id
        });

        if (!relationship) {
            return res.status(409).json({
                success: false,
                message:
                    "Establish a relationship with this mill before requesting credit."
            });
        }

        // 5. Check the customer's existing credit account.
        let account = await MillCreditAccount.findOne({
            millId: mill._id,
            customerId: customer._id
        });

        if (account) {
            if (account.creditStatus === "approved") {
                return res.status(409).json({
                    success: false,
                    message:
                        "You already have an approved credit account."
                });
            }

            if (account.creditStatus === "pending") {
                return res.status(409).json({
                    success: false,
                    message:
                        "Your credit request is already awaiting review."
                });
            }

            if (account.creditStatus === "suspended") {
                return res.status(409).json({
                    success: false,
                    message:
                        "Your credit account is suspended. Contact the mill owner."
                });
            }

            if (
                account.creditStatus === "rejected" &&
                account.reapplyAfter &&
                new Date() < account.reapplyAfter
            ) {
                return res.status(429).json({
                    success: false,
                    message: "Your credit request was rejected.",
                    reapplyAfter: account.reapplyAfter
                });
            }
        }

        // 6. Evaluate eligibility using server-side records.
        const eligibility = await evaluateCreditEligibility({
            millId: mill._id.toString(),
            customerId: customer._id.toString(),
            targetLevel
        });

        // Do not create a request when mandatory checks fail
        // or cannot yet be verified.
        if (!eligibility.eligible) {
            return res.status(409).json({
                success: false,
                code: "CREDIT_ELIGIBILITY_NOT_MET",
                message:
                    "Credit cannot be requested until all mandatory eligibility checks pass.",
                eligibility
            });
        }

        // 7. Create or reuse the customer's account.
        const now = new Date();

        if (!account) {
            account = new MillCreditAccount({
                millId: mill._id,
                customerId: customer._id
            });
        }

        account.creditLevel = 0;
        account.creditStatus = "pending";
        account.approvedLimit = 0;
        account.creditDueDays = 0;

        account.requestedLevel = targetLevel;
        account.requestedAt = now;

        account.lastEligibilityScore =
            eligibility.eligibilityScore;

        account.lastSuggestedLimit =
            eligibility.suggestedLimitNPR;

        account.lastEligibilityCheckAt =
            eligibility.evaluatedAt;

        account.rejectedAt = null;
        account.rejectionReason = null;
        account.reapplyAfter = null;

        await account.save();

        // 8. Inform the customer that owner approval is still required.
        return res.status(201).json({
            success: true,
            message:
                "Credit request submitted. The mill owner must review and approve it.",
            data: {
                accountId: account._id,
                creditStatus: account.creditStatus,
                currentLevel: account.creditLevel,
                requestedLevel: account.requestedLevel,
                eligibilityScore: account.lastEligibilityScore,
                suggestedLimitNPR: account.lastSuggestedLimit,
                requestedAt: account.requestedAt
            }
        });
    } catch (error) {
        if (
            error.name === "ValidationError" ||
            error.name === "CastError"
        ) {
            return res.status(400).json({
                success: false,
                message: "Credit request validation failed.",
                error: error.message
            });
        }

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    "A credit account already exists for this customer and mill. Please retry or check its status."
            });
        }

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message
            });
        }

        console.error("Credit request error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to process the credit request."
        });
    }
}
);



export default router;
