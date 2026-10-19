#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
// Default wait: a sub-agent's prompt cache lives 5 minutes, so each wait must end before that.
const MONITOR_WAIT_SECONDS = 240;
const MONITOR_POLL_SECONDS = 2;

const logPath = process.argv[2];
const waitLimitSeconds = Number(process.argv[3] ?? MONITOR_WAIT_SECONDS);
const pollSeconds = MONITOR_POLL_SECONDS;
const donePath = `${logPath}.done`;

let elapsedSeconds = 0;
while (elapsedSeconds < waitLimitSeconds) {
  const isDone = existsSync(donePath);
  if (isDone) {
    console.log("TEST RUN FINISHED");
    console.log(readFileSync(donePath, "utf8"));
    console.log(`Full log: ${logPath}`);
    process.exit(0);
  }
  await setTimeout(pollSeconds * 1000);
  elapsedSeconds += pollSeconds;
}
console.log(`TEST RUN STILL IN PROGRESS. Run this command again: node ${process.argv[1]} ${logPath}`);
process.exit(0);
