#!/usr/bin/env node
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
// Writes the end-of-turn marker that the ask-dont-dump-issues Stop hook checks.

const sessionId = process.env.CLAUDE_CODE_SESSION_ID;
if (!sessionId)
  throw new Error("turn-done: CLAUDE_CODE_SESSION_ID is not set");
const path = getSessionStatePath(sessionId);
const state = readSessionState(path);
state.done = Math.floor(Date.now() / 1000);
writeSessionState(path, state);
