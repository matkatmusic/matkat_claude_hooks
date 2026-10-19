// PostToolUse (Edit|Write): reflow wrapped comments in the file just written. Never blocks; the Stop hook asks for rewrites.
import { existsSync, readFileSync } from "node:fs";
import { applyReflowToFile, formatReflows } from "./reflowComments.ts";

const input = JSON.parse(readFileSync(0, "utf8"));
const path = input.tool_input?.file_path;
const pathIsString = typeof path === "string";
const pathExists = pathIsString && existsSync(path);
if (!pathExists)
  process.exit(0);

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
