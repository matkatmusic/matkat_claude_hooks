// PostToolUse: record the edited file path in session state for the Stop hook.
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";

const input = JSON.parse(readFileSync(0, "utf8"));
const path = input.tool_input?.file_path;
const pathIsString = typeof path === "string";
const pathExists = pathIsString && existsSync(path);
if (!pathExists)
  process.exit(0);

const statePath = getSessionStatePath(input.transcript_path, getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
const state = readSessionState(statePath);
const editedFiles = state.editedFiles ?? [];
const isAlreadyRecorded = editedFiles.includes(path);
if (!isAlreadyRecorded) {
  editedFiles.push(path);
  state.editedFiles = editedFiles;
  writeSessionState(statePath, state);
}
