import cron from "node-cron";
import Session from "../models/Session.js";
import { runBinaryMatching } from "./binaryMatcher.js";

const SESSIONS = [
  { no: 1, start: "06:00", end: "08:15" },
  { no: 2, start: "08:15", end: "10:30" },
  { no: 3, start: "10:30", end: "12:45" },
  { no: 4, start: "12:45", end: "15:00" },
  { no: 5, start: "15:00", end: "17:15" },
  { no: 6, start: "17:15", end: "19:30" },
  { no: 7, start: "19:30", end: "21:45" },
  { no: 8, start: "21:45", end: "00:00" }
];

cron.schedule("*/135 * * * *", async () => {
  const last = await Session.findOne().sort({ createdAt: -1 });
  const next = last ? (last.sessionNo % 8) + 1 : 1;

  await Session.create({
    sessionNo: next,
    start: SESSIONS[next - 1].start,
    end: SESSIONS[next - 1].end,
    executedAt: new Date()
  });

  await runBinaryMatching(next);
});
