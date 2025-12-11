// routes/epinRoutes.js

const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth");
const admin = require("../middleware/admin");
const EPIN = require("../models/EPIN");
const User = require("../models/User");
const Package = require("../models/Package");
const PVLedger = require("../models/PVLedger");
const Settings = require("../models/Settings");

// ---------------------------
// ADMIN: GENERATE EPINS
// ---------------------------
router.post("/generate", auth, admin, async (req, res) => {
    try {
        const { quantity, packageName } = req.body;

        if (!quantity || !packageName) {
            return res.status(400).json({ message: "Quantity और Package required" });
        }

        let pins = [];

        for (let i = 0; i < quantity; i++) {
            const code = "EP" + Math.random().toString(36).substring(2, 12).toUpperCase();

            const epin = new EPIN({
                code,
                packageName,
                createdBy: req.user.id
            });

            await epin.save();
            pins.push(epin.code);
        }

        res.json({ message: "EPIN generated", pins });

    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err });
    }
});

// ---------------------------
// GET MY EPINS
// ---------------------------
router.get("/my-epins", auth, async (req, res) => {
    try {
        const pins = await EPIN.find({ owner: req.user.id }).sort({ createdAt: -1 });
        res.json(pins);
    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// ---------------------------
// TRANSFER EPIN
// ---------------------------
router.post("/transfer", auth, async (req, res) => {
    try {
        const { epinCode, receiverId } = req.body;

        const pin = await EPIN.findOne({ code: epinCode });

        if (!pin) return res.status(404).json({ message: "Invalid EPIN" });
        if (pin.used) return res.status(400).json({ message: "EPIN already used" });
        if (pin.owner.toString() !== req.user.id) {
            return res.status(400).json({ message: "You are not owner of EPIN" });
        }

        const receiver = await User.findOne({ userId: receiverId });
        if (!receiver) return res.status(404).json({ message: "Receiver not found" });

        pin.owner = receiver._id;
        await pin.save();

        res.json({ message: "EPIN transferred successfully" });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

// --------------------------------
// USER: ACTIVATE PACKAGE USING EPIN
// --------------------------------
router.post("/activate", auth, async (req, res) => {
    try {
        const { epinCode } = req.body;

        const settings = await Settings.findOne({});
        if (!settings.epinToken) {
            return res.status(403).json({ message: "EPIN Token OFF (Testing Mode)" });
        }

        const pin = await EPIN.findOne({ code: epinCode });
        if (!pin) return res.status(404).json({ message: "Invalid EPIN" });
        if (pin.used) return res.status(400).json({ message: "EPIN already used" });

        // user
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // package details
        const pkg = await Package.findOne({ name: pin.packageName });
        if (!pkg) return res.status(404).json({ message: "Package not found" });

        // Update user package
        user.package = pkg.name;
        user.pv = pkg.pv;
        user.packageActive = true;
        user.activationDate = Date.now();
        await user.save();

        // EPIN mark used
        pin.used = true;
        pin.usedBy = user._id;
        pin.usedDate = Date.now();
        await pin.save();

        // PV Ledger entry
        const pvEntry = new PVLedger({
            userId: user._id,
            pv: pkg.pv,
            type: "PACKAGE ACTIVATION",
            packageName: pkg.name
        });
        await pvEntry.save();

        res.json({
            message: "Package Activated Successfully",
            package: pkg.name,
            pv: pkg.pv
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error", error: err });
    }
});

// ---------------------------
// ADMIN: TOGGLE EPIN TOKEN (ON/OFF)
// ---------------------------
router.post("/toggle-token", auth, admin, async (req, res) => {
    try {
        const settings = await Settings.findOne({});
        settings.epinToken = !settings.epinToken;
        await settings.save();

        res.json({
            message: "EPIN Token Updated",
            epinToken: settings.epinToken
        });

    } catch (err) {
        res.status(500).json({ message: "Server Error" });
    }
});

module.exports = router;
