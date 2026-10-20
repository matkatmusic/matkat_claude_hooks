// PostToolUse: reflow comments in the edited file and record its path for the Stop hook.
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";
import { applyReflowToFile, formatReflows } from "./reflowComments.ts";

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

const runs = applyReflowToFile(path);
let anyJoined = false;
for (const run of runs) {
  if (run.joined)
    anyJoined = true;
}
if (!anyJoined)
  process.exit(0);
process.stdout.write(`${JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: formatReflows([{ path, runs }], []) },
})}\n`);
