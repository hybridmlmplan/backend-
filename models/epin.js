import mongoose from "mongoose";

const epinSchema = new mongoose.Schema(
  {
    epinCode: { type: String, unique: true, required: true }, 
    // Example: SP-123456, GP-987654, RP-555666

    packageType: {
      type: String,
      enum: ["silver", "gold", "ruby"],
      required: true,
    },

    generatedBy: {
      type: String, // adminId or userId
    },

    assignedTo: {
      type: String, // userId who received this pin
      default: null,
    },

    usedBy: {
      type: String, // userId who activated package
      default: null,
    },

    isUsed: { type: Boolean, default: false },

    usedDate: {
      type: Date,
      default: null,
    },

    transferHistory: [
      {
        from: String,
        to: String,
        date: { type: Date, default: Date.now },
      },
    ],

    // ❗ PIN NEVER EXPIRES
    expires: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("EPIN", epinSchema);
