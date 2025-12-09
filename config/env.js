// config/env.js
import dotenv from "dotenv";

dotenv.config();

// Required env keys
const required = [
  "MONGO_URI",
  "JWT_SECRET",
  "PORT"
];

for (const k of required) {
  if (!process.env[k]) {
    console.warn(`[WARN] env ${k} not set — please add to your .env`);
  }
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/hybridmlm",
  jwtSecret: process.env.JWT_SECRET || "change_this_secret",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "30d",
  logLevel: process.env.LOG_LEVEL || "info"
};

export default env;
