// Stop: reflow the files edited this session and block on over-cap comments.
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";
import { applyReflowToFile, emitReflows, type FileReflow } from "./reflowComments.ts";

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.stop_hook_active === true)
  process.exit(0);

const statePath = getSessionStatePath(input.transcript_path, getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
const editedFiles = readSessionState(statePath).editedFiles ?? [];
const files: FileReflow[] = [];
for (const path of editedFiles) {
  const pathExists = existsSync(path);
  if (pathExists)
    files.push({ path, runs: applyReflowToFile(path) });
}
emitReflows("Stop", files, getSetting(input, "CLAUDE_HOOKS_REFLOW_MAX_REWRITES"), input.session_id);
