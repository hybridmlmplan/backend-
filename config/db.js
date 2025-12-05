import mongoose from "mongoose";

const connectDB = async () => {
  try {
    // Performance + strict mode configs
    mongoose.set("strictQuery", true);

    await mongoose.connect(process.env.MONGO_URI, {
      // recommended options
      autoIndex: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log("✅ MongoDB Connected Successfully");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:");
    console.error(err.message);

    // Exit process if DB fails
    process.exit(1);
  }
};

export default connectDB;
