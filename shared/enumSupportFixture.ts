#!/usr/bin/env bun
import { readFileSync } from "node:fs";

enum RunMode {
    Fast = "fast",
    Slow = "slow",
}

const payload = JSON.parse(readFileSync(0, "utf8"));
const runMode = payload.mode === "fast" ? RunMode.Fast : RunMode.Slow;
console.log(runMode);
