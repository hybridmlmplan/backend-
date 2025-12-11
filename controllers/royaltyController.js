// controllers/royaltyController.js
// FINAL Royalty Engine as per complete business plan

const User = require("../models/User");
const Wallet = require("../models/Wallet");
const BVLedger = require("../models/BVLedger");

// =====================================================
//  ROYALTY CONFIG (Permanent lifetime cumulative system)
// =====================================================
const ROYALTY_PERCENT = {
    STAR: 3,              // only until earning ₹35
    SILVER_STAR: 1,
    GOLD_STAR: 2,
    RUBY_STAR: 3,
    EMERALD_STAR: 4,
    DIAMOND_STAR: 5,
    CROWN_STAR: 6,
    AMBASSADOR_STAR: 7,
    COMPANY_STAR: 8
};

const RANK_FLOW = [
    "STAR",
    "SILVER_STAR",
    "GOLD_STAR",
    "RUBY_STAR",
    "EMERALD_STAR",
    "DIAMOND_STAR",
    "CROWN_STAR",
    "AMBASSADOR_STAR",
    "COMPANY_STAR"
];

// =====================================================
// 1️⃣ STAR rank special rule (3% until earning ₹35)
// =====================================================
const blockStarRoyaltyAfter35 = (user, amount) => {
    if (user.starRoyaltyEarned >= 35) return 0;

    let remaining = 35 - user.starRoyaltyEarned;

    return Math.min(amount, remaining);
};

// =====================================================
// 2️⃣ GET cumulative royalty % based on rank
// =====================================================
const getCumulativeRoyaltyPercent = (rank) => {
    let total = 0;

    for (let r of RANK_FLOW) {
        total += ROYALTY_PERCENT[r];
        if (r === rank) break;
    }

    return total;
};

// =====================================================
// 3️⃣ MONTHLY ROYALTY ENGINE
// =====================================================
exports.processMonthlyRoyalty = async (req, res) => {
    try {
        // TOTAL CTO BV of this month
        const total = await BVLedger.aggregate([
            { $match: { type: "MONTHLY_CTO_BV" } },
            { $group: { _id: null, total: { $sum: "$amount" } } }
        ]);

        const CTO_BV = total.length ? total[0].total : 0;

        if (CTO_BV <= 0) {
            return res.status(200).json({
                message: "No CTO BV found this month."
            });
        }

        const users = await User.find({});
        let reports = [];

        for (let user of users) {
            if (!user.rank) continue;

            const cumulativePercent = getCumulativeRoyaltyPercent(user.rank);

            let royalty = (CTO_BV * cumulativePercent) / 100;

            // ⭐ SPECIAL RULE FOR STAR RANK
            if (user.rank === "STAR") {
                royalty = blockStarRoyaltyAfter35(user, royalty);
                user.starRoyaltyEarned += royalty;
            }

            // Credit royalty to wallet
            await Wallet.findOneAndUpdate(
                { userId: user._id },
                {
                    $inc: {
                        balance: royalty,
                        royaltyIncome: royalty
                    }
                },
                { new: true }
            );

            reports.push({
                userId: user._id,
                rank: user.rank,
                royaltyPercent: cumulativePercent,
                royaltyAmount: royalty
            });

            await user.save();
        }

        return res.status(200).json({
            message: "Monthly Royalty Distributed Successfully.",
            CTO_BV,
            distribution: reports
        });

    } catch (err) {
        console.log("Royalty Error:", err);
        return res.status(500).json({ message: "Royalty Engine Failed" });
    }
};

// =====================================================
// 4️⃣ USER ROYALTY SUMMARY API
// =====================================================
exports.getRoyaltySummary = async (req, res) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);
        const wallet = await Wallet.findOne({ userId });

        return res.status(200).json({
            rank: user.rank,
            cumulativeRoyaltyPercent: getCumulativeRoyaltyPercent(user.rank),
            lifetimeRoyaltyEarned: wallet.royaltyIncome,
            starRoyaltyEarned: user.starRoyaltyEarned
        });

    } catch (err) {
        console.log("Royalty Summary Error:", err);
        return res.status(500).json({ message: "Unable to fetch royalty summary" });
    }
};
