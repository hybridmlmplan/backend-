import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';

import authRoute from './routes/auth.js';
import incomeRoute from './routes/income.js';

dotenv.config();
connectDB();

const app = express();
app.use(express.json());
app.use(cors());

app.use('/api/auth', authRoute);
app.use('/api/income', incomeRoute);

app.listen(process.env.PORT || 5000, () =>
  console.log(`Backend running on PORT ${process.env.PORT || 5000}`)
);
