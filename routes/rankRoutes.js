// routes/rankRoutes.js

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const User = require("../models/User");
const RankHistory = require("../models/RankHistory");

// --------------------------------------------------
// STATIC RANK TABLE (NO PAYOUT) — SAFE
// --------------------------------------------------
const rankTable = {
    silver: [
        "Star", "Silver Star", "Gold Star", "Ruby Star",
        "Emerald Star", "Diamond Star", "Crown Star",
        "Ambassador Star", "Company Star"
    ],
    gold: [
        "Star", "Silver Star", "Gold Star", "Ruby Star",
        "Emerald Star", "Diamond Star", "Crown Star",
        "Ambassador Star", "Company Star"
    ],
    ruby: [
        "Star", "Silver Star", "Gold Star", "Ruby Star",
        "Emerald Star", "Diamond Star", "Crown Star",
        "Ambassador Star", "Company Star"
    ]
};

// --------------------------------------------------
// ADMIN — UPDATE USER RANK (SAFE)
// --------------------------------------------------
router.post("/update", auth, admin, async (req, res) => {
    try {
        const { userId, rank, rankType, note } = req.body;

        const user = await User.findOne({ userId });
        if (!user)
            return res.status(404).json({ message: "User not found" });

        // Validate rank type
        if (!rankTable[rankType])
            return res.status(400).json({ message: "Invalid rank type" });

        // Validate rank name
        if (!rankTable[rankType].includes(rank))
            return res.status(400).json({ message: "Invalid rank name" });

        // Save previous rank
        const previousRank = user.rank || "None";

        // Update new rank
        user.rank = rank;
        user.rankType = rankType;
        user.rankUpdatedAt = new Date();

        await user.save();

        // Add history entry
        const rh = new RankHistory({
            userId,
            oldRank: previousRank,
            newRank: rank,
            rankType,
            note: note || "",
            date: new Date()
        });

        await rh.save();

        res.json({
            message: "Rank updated successfully",
            userRank: {
                userId,
                previousRank,
                newRank: rank,
                rankType
            }
        });

    } catch (err) {
        res.status(500).json({ message: "Server error", error: err });
    }
});

// --------------------------------------------------
// USER — GET OWN RANK DETAILS
// --------------------------------------------------
router.get("/my-rank", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select("userId name rank rankType rankUpdatedAt");

        if (!user)
            return res.status(404).json({ message: "User not found" });

        res.json({
            rank: user.rank || "None",
            type: user.rankType || "None",
            updatedAt: user.rankUpdatedAt
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// --------------------------------------------------
// ADMIN — GET USER RANK HISTORY
// --------------------------------------------------
router.get("/history/:userId", auth, admin, async (req, res) => {
    try {
        const history = await RankHistory.find({ userId: req.params.userId })
            .sort({ date: -1 });

        res.json(history);

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

// --------------------------------------------------
// PUBLIC — GET STATIC RANK TABLE
// --------------------------------------------------
router.get("/rank-table", async (req, res) => {
    try {
        res.json(rankTable);

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
