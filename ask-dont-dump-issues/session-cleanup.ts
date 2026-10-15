#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
// SessionEnd: clears this session's done and reminded keys from its state file.

const input = JSON.parse(readFileSync(0, "utf8"));
const path = getSessionStatePath(input.session_id);
if (existsSync(path)) {
  const state = readSessionState(path);
  delete state.done;
  delete state.reminded;
  writeSessionState(path, state);
}
