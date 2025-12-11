// routes/fundRoutes.js

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const FundPool = require("../models/FundPool");
const User = require("../models/User");
const Franchise = require("../models/Franchise");

// -------------------------------------------------
// ADMIN — UPDATE MONTHLY FUND POOLS (BV BASED)
// -------------------------------------------------
router.post("/update-pool", auth, admin, async (req, res) => {
    try {
        const { carFund, houseFund, travelFund, ctoBV } = req.body;

        const pool = await FundPool.findOne({}) || new FundPool({});

        if (carFund !== undefined) pool.carFund = carFund;
        if (houseFund !== undefined) pool.houseFund = houseFund;
        if (travelFund !== undefined) pool.travelFund = travelFund;
        if (ctoBV !== undefined) pool.ctoBV = ctoBV;

        await pool.save();

        res.json({
            message: "Fund pool updated successfully",
            pool,
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err });
    }
});

// -------------------------------------------------
// GET CURRENT FUND POOLS
// -------------------------------------------------
router.get("/pools", auth, async (req, res) => {
    try {
        const pools = await FundPool.findOne({});

        res.json({
            carFund: pools?.carFund || 0,
            houseFund: pools?.houseFund || 0,
            travelFund: pools?.travelFund || 0,
            ctoBV: pools?.ctoBV || 0
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// -------------------------------------------------
// USER — CHECK FUND ELIGIBILITY (BASED ON RANK)
// -------------------------------------------------
router.get("/eligibility", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user)
            return res.status(404).json({ message: "User not found" });

        let eligibility = {
            carFund: false,
            houseFund: false,
            travelFund: false,
            rank: user.rank || "None"
        };

        // Rank logic (safe)
        if (user.rankValue >= 4) eligibility.carFund = true;   // Ruby Star+
        if (user.rankValue >= 6) eligibility.houseFund = true; // Diamond Star+
        if (user.rankValue >= 4) eligibility.travelFund = true;

        res.json({
            message: "Eligibility fetched",
            eligibility
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// -------------------------------------------------
// ADMIN — MANUAL FUND ENTRY RECORD (SAFE)
// -------------------------------------------------
router.post("/add-entry", auth, admin, async (req, res) => {
    try {
        const { userId, fundType, amount, note } = req.body;

        const user = await User.findOne({ userId });
        if (!user)
            return res.status(404).json({ message: "User not found" });

        user.fundHistory.push({
            fundType,
            amount,
            note,
            date: Date.now()
        });

        await user.save();

        res.json({
            message: "Fund entry added successfully",
            history: user.fundHistory
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err });
    }
});

// -------------------------------------------------------------
// ⭐ FRANCHISE SYSTEM — PRODUCT-WISE BV FUND PERCENTAGE SUPPORT
// -------------------------------------------------------------
router.post("/franchise/add-bv", auth, async (req, res) => {
    try {
        const { franchiseId, productId, bv, percent } = req.body;

        const franchise = await Franchise.findOne({ franchiseId });
        if (!franchise)
            return res.status(404).json({ message: "Franchise not found" });

        franchise.bvHistory.push({
            productId,
            bv,
            percent,
            earned: (bv * percent) / 100,
            date: Date.now()
        });

        await franchise.save();

        res.json({
            message: "Franchise BV recorded",
            bvHistory: franchise.bvHistory
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err });
    }
});

// -------------------------------------------------------------
// FRANCHISE — GET OWN BV FUND SUMMARY
// -------------------------------------------------------------
router.get("/franchise/summary", auth, async (req, res) => {
    try {
        const franchise = await Franchise.findOne({ userId: req.user.id });

        if (!franchise)
            return res.status(404).json({ message: "No franchise account" });

        const totalEarned = franchise.bvHistory.reduce(
            (sum, x) => sum + x.earned, 0
        );

        res.json({
            message: "Franchise fund summary",
            totalEarned,
            bvHistory: franchise.bvHistory
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
