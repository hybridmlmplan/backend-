import Package from "../models/Package.js";

// ==================================================
// CREATE PACKAGE  (ADMIN)
// ==================================================
export const createPackage = async (req, res) => {
  try {
    const {
      packageName,
      amount,
      pv,
      bv,
      pairIncome,
      capping,
      prefix
    } = req.body;

    if (!packageName || !amount || !pv || !bv || !pairIncome || !capping || !prefix) {
      return res.status(400).json({
        status: false,
        message: "All fields are required"
      });
    }

    // Prevent duplicate package
    const already = await Package.findOne({ packageName });
    if (already) {
      return res.status(400).json({
        status: false,
        message: `${packageName} package already exists`
      });
    }

    const newPackage = await Package.create({
      packageName,
      amount,
      pv,
      bv,
      pairIncome,
      capping,
      prefix
    });

    return res.json({
      status: true,
      message: "Package created successfully",
      data: newPackage
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Server error",
      error: error.message
    });
  }
};


// ==================================================
// GET ALL PACKAGES
// ==================================================
export const getPackages = async (req, res) => {
  try {
    const packages = await Package.find().sort({ amount: 1 });

    return res.json({
      status: true,
      message: "Packages fetched",
      data: packages
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Unable to fetch packages",
      error: error.message
    });
  }
};


// ==================================================
// UPDATE PACKAGE (ADMIN)
// ==================================================
export const updatePackage = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await Package.findByIdAndUpdate(id, req.body, {
      new: true,
    });

    if (!updated) {
      return res.status(404).json({
        status: false,
        message: "Package not found"
      });
    }

    return res.json({
      status: true,
      message: "Package updated",
      data: updated
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Update failed",
      error: error.message
    });
  }
};


// ==================================================
// ACTIVATE / DEACTIVATE PACKAGE
// ==================================================
export const togglePackageStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const pkg = await Package.findById(id);
    if (!pkg) {
      return res.status(404).json({
        status: false,
        message: "Package not found"
      });
    }

    pkg.isActive = !pkg.isActive;
    await pkg.save();

    return res.json({
      status: true,
      message: `Package ${pkg.isActive ? "Activated" : "Deactivated"} successfully`,
      data: pkg
    });

  } catch (error) {
    return res.status(500).json({
      status: false,
      message: "Failed to update status",
      error: error.message
    });
  }
};
