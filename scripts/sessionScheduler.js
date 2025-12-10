// backend/scripts/sessionScheduler.js
// Responsible to schedule/check 8 sessions daily and call binaryEngine.processSessionPairs(sessionIndex)
// Usage: node sessionScheduler.js   OR import and call start()

import { processSessionPairs } from "./binaryEngine.js";
import SessionModel from "../models/Session.js";

const SESSION_TIMES = [
  ["06:00", "08:15"],
  ["08:15", "10:30"],
  ["10:30", "12:45"],
  ["12:45", "15:00"],
  ["15:00", "17:15"],
  ["17:15", "19:30"],
  ["19:30", "21:45"],
  ["21:45", "00:00"]
];

function parseTimeToDate(baseDate, hhmm) {
  const [hh, mm] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(hh, mm, 0, 0);
  return d;
}

export async function runSessionNow(sessionIndex) {
  const start = new Date();
  return await processSessionPairs(sessionIndex + 1, start);
}

// Basic continuous scheduler: wakes every minute, checks if current time falls into an unprocessed session and runs it.
// This method is simple and reliable if you run the script continuously (pm2/systemd).
export function start() {
  console.log("Session Scheduler starting...");
  setInterval(async () => {
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (let i = 0; i < SESSION_TIMES.length; i++) {
        const [startStr, endStr] = SESSION_TIMES[i];
        const start = parseTimeToDate(today, startStr);
        const end = parseTimeToDate(today, endStr);
        // handle midnight end (21:45-00:00)
        if (end <= start) end.setDate(end.getDate() + 1);

        if (now >= start && now < end) {
          // check if session already processed for today
          const existing = await SessionModel.findOne({
            sessionNumber: i + 1,
            startedAt: { $gte: start, $lt: end }
          });
          if (!existing) {
            console.log(`Running session ${i + 1} at ${now.toISOString()}`);
            await runSessionNow(i);
          }
        }
      }
    } catch (err) {
      console.error("Session scheduler error:", err);
    }
  }, 60 * 1000); // check every minute
}

// If run directly
if (process.argv[1] && process.argv[1].endsWith("sessionScheduler.js")) {
  start();
}

export default { start, runSessionNow };
