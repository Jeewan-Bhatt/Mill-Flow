
import mongoose from "mongoose";

import Order from "../models/Order.js";
import Mill from "../models/Mill.js";
import Payment from "../models/Payment.js";

import MillCreditAccount from "../models/MillCreditAccount.js";
import MillCreditPolicy from "../models/MillCreditPolicy.js";
import CreditLedgerEntry from "../models/CreditLedgerEntry.js";
import CreditRepaymentAllocation from "../models/CreditRepaymentAllocation.js";

export async function recordCashOrderPayment({
    orderId,
    userId,
    notes = ""
}) {
    if (
        !mongoose.isValidObjectId(orderId) ||
        !mongoose.isValidObjectId(userId)
    ) {
        throw new Error("Invalid order or user ID.");
    }

    const session = await mongoose.startSession();

    try {
        let recordedPayment;

        await session.withTransaction(async () => {
            // Load the order inside the transaction.
            const order = await Order.findById(orderId)
                .session(session);

            if (!order) {
                throw new Error("Order not found.");
            }

            if (order.status !== "completed") {
                throw new Error(
                    "Only completed orders can be paid."
                );
            }

            if (
                !Number.isFinite(order.finalAmount) ||
                order.finalAmount <= 0
            ) {
                throw new Error(
                    "The order has an invalid final amount."
                );
            }

            if (order.paymentStatus !== "unpaid") {
                throw new Error(
                    "This order is not available for payment."
                );
            }

            // Only the mill owner can record cash payments.
            const mill = await Mill.findOne({
                _id: order.millId,
                ownerId: userId,
                isActive: true
            }).session(session);

            if (!mill) {
                throw new Error(
                    "Only the active mill owner can record cash payments."
                );
            }

            // Atomically claim the unpaid order.
            const claimResult = await Order.updateOne(
                {
                    _id: order._id,
                    status: "completed",
                    paymentStatus: "unpaid"
                },
                {
                    $set: {
                        paymentStatus: "paid"
                    }
                },
                { session }
            );

            if (claimResult.modifiedCount !== 1) {
                throw new Error(
                    "This order has already been paid or is no longer available."
                );
            }

            // Create the payment in the same transaction.
            const [payment] = await Payment.create(
                [
                    {
                        type: "order_payment",
                        orderId: order._id,
                        millId: order.millId,
                        customerId: order.customerId,
                        recordedBy: userId,
                        verifiedBy: userId,
                        amount: order.finalAmount,
                        method: "cash",
                        status: "verified",
                        paidAt: new Date(),
                        verifiedAt: new Date(),
                        notes
                    }
                ],
                { session }
            );

            recordedPayment = payment;
        });

        return recordedPayment;
    } finally {
        await session.endSession();
    }
}

export async function useCreditForOrder({
    orderId,
    customerId,
    userId
}) {
    if (
        !mongoose.isValidObjectId(orderId) ||
        !mongoose.isValidObjectId(customerId) ||
        !mongoose.isValidObjectId(userId)
    ) {
        throw new Error("Invalid order, customer, or user ID.");
    }

    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            const order = await Order.findById(orderId).session(session);

            if (!order || String(order.customerId) !== String(customerId)) {
                throw new Error("Order not found for this customer.");
            }

            if (
                order.status !== "completed" ||
                order.paymentStatus !== "unpaid" ||
                !Number.isFinite(order.finalAmount) ||
                order.finalAmount <= 0
            ) {
                throw new Error("Order is not available for credit payment.");
            }

            const account = await MillCreditAccount.findOne({
                millId: order.millId,
                customerId,
                creditStatus: "approved",
                creditLevel: { $gte: 1 }
            }).session(session);

            if (!account || account.creditDueDays < 1) {
                throw new Error("No valid approved credit account exists.");
            }

            const policy = await MillCreditPolicy.findOne({
                millId: order.millId
            }).session(session);

            if (!policy || !policy.isActive) {
                throw new Error("The mill credit policy is inactive.");
            }

            // Calculate all credit originally used.
            const ledgerEntries = await CreditLedgerEntry.find({
                millId: order.millId,
                customerId
            }).session(session).lean();

            const allocations = await CreditRepaymentAllocation.aggregate([
                {
                    $match: {
                        millId: order.millId,
                        customerId: account.customerId
                    }
                },
                {
                    $group: {
                        _id: "$creditLedgerEntryId",
                        total: { $sum: "$amount" }
                    }
                }
            ]).session(session);

            const repaidByEntry = new Map(
                allocations.map(item => [
                    String(item._id),
                    item.total
                ])
            );

            const now = new Date();
            let outstanding = 0;
            let overdue = false;

            for (const entry of ledgerEntries) {
                const repaid = repaidByEntry.get(String(entry._id)) || 0;
                const remaining = Math.max(0, entry.amount - repaid);

                outstanding += remaining;

                if (remaining > 0 && entry.dueAt < now) {
                    overdue = true;
                }
            }

            if (policy.blockIfOverdue && overdue) {
                throw new Error(
                    "Credit usage is blocked because the customer has overdue debt."
                );
            }

            const availableCredit = account.approvedLimit - outstanding;

            if (order.finalAmount > availableCredit) {
                throw new Error(
                    "The order exceeds the customer's available credit."
                );
            }

            // Claim the order so it cannot be charged twice.
            const claim = await Order.updateOne(
                {
                    _id: order._id,
                    status: "completed",
                    paymentStatus: "unpaid"
                },
                {
                    $set: { paymentStatus: "credit_used" }
                },
                { session }
            );

            if (claim.modifiedCount !== 1) {
                throw new Error(
                    "The order has already been paid or claimed."
                );
            }

            const [entry] = await CreditLedgerEntry.create(
                [{
                    millId: order.millId,
                    customerId,
                    creditAccountId: account._id,
                    orderId: order._id,
                    amount: order.finalAmount,
                    dueAt: new Date(
                        now.getTime() +
                        account.creditDueDays * 24 * 60 * 60 * 1000
                    ),
                    recordedBy: userId,
                    notes: `Credit used for order ${order._id}`
                }],
                { session }
            );

            result = {
                orderId: order._id,
                creditLedgerEntryId: entry._id,
                amount: entry.amount,
                outstandingAfterCharge: outstanding + entry.amount,
                availableCreditAfterCharge:
                    availableCredit - entry.amount
            };
        });

        return result;
    } finally {
        await session.endSession();
    }
}
