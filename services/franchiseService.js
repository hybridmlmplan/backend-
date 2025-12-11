// ======================================================================
// FRANCHISE SERVICE (FINAL PRODUCTION VERSION)
// ======================================================================

import Franchise from "../models/Franchise.js";
import Product from "../models/Product.js";
import Sale from "../models/Sale.js";
import User from "../models/User.js";
import Wallet from "../models/Wallet.js";
import BVLedger from "../models/BVLedger.js";

/**
 * Create a new sale from franchise
 * Handles BV distribution, referrer income, franchise income
 * No income ever stops. All incomes lifetime.
 */

export const processFranchiseSale = async ({
    franchiseId,
    productId,
    quantity,
    buyerUserId,
    referrerUserId,
}) => {
    // -----------------------------
    // 1. Fetch franchise
    // -----------------------------
    const franchise = await Franchise.findOne({ franchiseId });
    if (!franchise) throw new Error("Invalid Franchise ID");

    // -----------------------------
    // 2. Fetch product
    // -----------------------------
    const product = await Product.findById(productId);
    if (!product) throw new Error("Product not found");

    // -----------------------------
    // 3. Stock check (if managed by franchise)
    // -----------------------------
    if (product.stockManagedByFranchise === "yes") {
        const current = franchise.stock.get(productId) || 0;
        if (current < quantity) throw new Error("Insufficient stock");
        franchise.stock.set(productId, current - quantity);
        await franchise.save();
    }

    // -----------------------------
    // 4. Calculate totals
    // -----------------------------
    const totalAmount = product.price * quantity;
    const totalBV = product.BV * quantity;
    const totalPV = product.PV * quantity;

    // -----------------------------
    // 5. Create sale entry
    // -----------------------------
    const sale = await Sale.create({
        saleId: `SALE${Date.now()}`,
        franchiseId,
        productId,
        quantity,
        totalAmount,
        totalBV,
        totalPV,
        referrerUserId,
        buyerUserId,
        date: new Date(),
    });

    // -----------------------------
    // 6. Franchise Holder Income
    // -----------------------------
    // product-wise override OR default 5%
    const franchisePercent =
        product.franchiseCommissionPercent ||
        franchise.franchiseCommissionPercent ||
        5;

    const franchiseIncome = (totalAmount * franchisePercent) / 100;

    await Wallet.findOneAndUpdate(
        { userId: franchise.ownerUserId },
        {
            $inc: {
                balance: franchiseIncome,
                franchiseIncome: franchiseIncome,
            },
        },
        { upsert: true }
    );

    // -----------------------------
    // 7. Referrer 1% BV Income
    // -----------------------------
    const referrerIncome = totalBV * 0.01;

    if (referrerUserId) {
        await Wallet.findOneAndUpdate(
            { userId: referrerUserId },
            {
                $inc: {
                    balance: referrerIncome,
                    referrerIncome: referrerIncome,
                },
            },
            { upsert: true }
        );
    }

    // -----------------------------
    // 8. Add BV to buyer (for royalty + level + fund)
    // -----------------------------
    await BVLedger.create({
        userId: buyerUserId,
        amount: totalBV,
        source: "Franchise Sale",
        date: new Date(),
    });

    await User.findByIdAndUpdate(buyerUserId, {
        $inc: {
            totalBV: totalBV,
        },
    });

    // -----------------------------
    // 9. Return final response
    // -----------------------------
    return {
        status: true,
        message: "Sale processed successfully",
        sale,
        franchiseIncome,
        referrerIncome,
        totalAmount,
        totalBV,
        totalPV,
    };
};
