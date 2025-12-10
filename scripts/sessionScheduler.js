// backend/scripts/sessionScheduler.js
// Scheduler for 8 daily sessions (2h15m windows) — FINAL plan
// Requires: node-cron (npm i node-cron)
// Usage: require and call startScheduler() from server.js (or run as a separate worker process).

import cron from "node-cron";
import mongoose from "mongoose";
import BinaryEngine from "./binaryEngine.js";
import RankEngine from "./rankEngine.js"; // optional follow-up
import SessionRun from "../models/SessionRun.js"; // schema explained below
import logger from "../utils/logger.js"; // optional logger, fallback to console if not present

const LOG = logger || console;

// Session time slots (24-hour). These are the start times of each session window.
const SESSION_SLOTS = [
  { idx: 1, hhmm: "06:00" }, // 06:00 – 08:15
  { idx: 2, hhmm: "08:15" }, // 08:15 – 10:30
  { idx: 3, hhmm: "10:30" }, // 10:30 – 12:45
  { idx: 4, hhmm: "12:45" }, // 12:45 – 15:00
  { idx: 5, hhmm: "15:00" }, // 15:00 – 17:15
  { idx: 6, hhmm: "17:15" }, // 17:15 – 19:30
  { idx: 7, hhmm: "19:30" }, // 19:30 – 21:45
  { idx: 8, hhmm: "21:45" }  // 21:45 – 00:00
];

// Helper: convert "HH:MM" to cron pattern "M H * * *"
function hhmmToCron(hhmm) {
  const [hh, mm] = hhmm.split(":").map(s => parseInt(s, 10));
  return `${mm} ${hh} * * *`;
}

// Helper: today's date key 'YYYY-MM-DD'
function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// Ensure SessionRun model exists; expected schema (Mongoose):
// {
//   dateKey: String,        // 'YYYY-MM-DD'
//   sessionNumber: Number,  // 1..8
//   runAt: Date,
//   processedCount: Number,
//   processedPairs: Array,
//   createdAt: Date
// }
// If your model name/fields differ, update accordingly.
async function hasSessionRun(dateKey, sessionNumber) {
  const found = await SessionRun.findOne({ dateKey, sessionNumber }).lean();
  return !!found;
}

async function recordSessionRun(dateKey, sessionNumber, processedCount, processedPairs = []) {
  return SessionRun.create({
    dateKey,
    sessionNumber,
    runAt: new Date(),
    processedCount,
    processedPairs,
    createdAt: new Date()
  });
}

// Core job for a session slot
async function runSessionJob(sessionNumber, sessionStart) {
  try {
    const dateKey = todayKey(sessionStart);
    LOG.info?.(`Starting session job ${sessionNumber} for date ${dateKey} at ${sessionStart.toISOString()}`);

    // Idempotency: skip if already run for this date+sessionNumber
    const already = await hasSessionRun(dateKey, sessionNumber);
    if (already) {
      LOG.info?.(`Session ${sessionNumber} already processed for ${dateKey} — skipping.`);
      return { status: "skipped", sessionNumber, dateKey };
    }

    // Call binary engine
    const res = await BinaryEngine.processSessionPairs(sessionNumber, sessionStart);
    LOG.info?.(`Session ${sessionNumber} processed: result status=${res?.status}, processed=${res?.processed}`);

    // Save run record for audit / idempotency
    const processedPairs = res?.processedPairs || [];
    await recordSessionRun(dateKey, sessionNumber, res?.processed || 0, processedPairs);

    // Optional follow-up: run rank upgrade on each processed user (lightweight)
    try {
      if (processedPairs.length > 0) {
        // Deduplicate user ids
        const uids = [...new Set(processedPairs.map(p => p.userId))];
        for (const uid of uids) {
          // upgradeUserRankIfEligible handles its own transactions and is idempotent
          await RankEngine.upgradeUserRankIfEligible(uid).catch(e => {
            LOG.error?.("Rank upgrade error for user", uid, e);
          });
        }
      }
    } catch (fu) {
      LOG.error?.("Post-session rank-upgrades error:", fu);
    }

    LOG.info?.(`Session ${sessionNumber} finished for ${dateKey}`);
    return { status: res?.status ? "done" : "error", res };
  } catch (err) {
    LOG.error?.("runSessionJob error:", err);
    return { status: "error", error: err.message || err };
  }
}

// Create cron jobs for all session slots
const scheduledTasks = [];

/**
 * Start scheduler: register cron tasks
 * Call this once (e.g., from server.js) when app boots.
 */
export function startScheduler() {
  // Avoid double-start
  if (scheduledTasks.length > 0) {
    LOG.warn?.("Session scheduler already started.");
    return scheduledTasks;
  }

  for (const slot of SESSION_SLOTS) {
    const cronExpr = hhmmToCron(slot.hhmm);
    const task = cron.schedule(cronExpr, async () => {
      // sessionStart is current time when triggered
      const sessionStart = new Date();
      try {
        await runSessionJob(slot.idx, sessionStart);
      } catch (e) {
        LOG.error?.(`Error running scheduled job for session ${slot.idx}:`, e);
      }
    }, {
      scheduled: true,
      timezone: process.env.SERVER_TIMEZONE || "Asia/Kolkata" // user timezone as provided
    });

    scheduledTasks.push({ slot: slot.idx, hhmm: slot.hhmm, task });
    LOG.info?.(`Scheduled session ${slot.idx} at ${slot.hhmm} (cron: ${cronExpr})`);
  }

  return scheduledTasks;
}

/**
 * Stop scheduler: stop all cron tasks
 */
export function stopScheduler() {
  for (const t of scheduledTasks) {
    try {
      t.task.stop();
    } catch (e) {
      LOG.error?.("Error stopping task:", e);
    }
  }
  scheduledTasks.length = 0;
  LOG.info?.("Session scheduler stopped.");
  return true;
}

/**
 * Manual trigger helper: allows admin to trigger a session run programmatically (idempotent)
 */
export async function triggerSessionNow(sessionNumber, sessionStart = new Date()) {
  return runSessionJob(sessionNumber, sessionStart);
}

export default {
  startScheduler,
  stopScheduler,
  triggerSessionNow
};
