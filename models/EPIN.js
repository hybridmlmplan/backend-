// models/EPIN.js
import mongoose from 'mongoose';
const { Schema } = mongoose;

/**
 * EPIN model
 * - epin: unique code
 * - packageType: which package it activates
 * - createdBy: admin user
 * - assignedTo: user who holds it (optional)
 * - isUsed: boolean
 * - usedBy, usedAt: usage tracking
