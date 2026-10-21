// Stop reflow hook: blocks on over-cap comments in the files edited this session.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "commentLengthLimiter.ts");
const LONG_COMMENT = ["// A wrapped comment that runs well past the twenty word cap once it",
  "// has been joined back together into one single long line of prose here.",
  "const x = 1;"].join("\n");

function runStop(editedFiles: string[], extra: object): string {
  const home = mkdtempSync(join(tmpdir(), "reflow-stop-home-"));
  const stateDir = mkdtempSync(join(tmpdir(), "reflow-stop-state-"));
  writeFileSync(join(stateDir, "stop-session.json"), JSON.stringify({ editedFiles }));
  return execFileSync("node", ["--no-inspect", SCRIPT], {
    input: JSON.stringify({
      hook_event_name: "Stop", session_id: "stop-session", transcript_path: "/t/stop-session.jsonl",
      settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir, CLAUDE_HOOKS_REFLOW_MAX_REWRITES: "2" }, ...extra,
    }),
    env: { ...process.env, HOME: home },
    encoding: "utf8", stdio: ["pipe", "pipe", "ignore"],
  });
}

function fileWith(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "reflow-stop-")), "sample.ts");
  writeFileSync(path, contents);
  return path;
}

test("an edited file with a long comment blocks the stop", () => {
  const out = JSON.parse(runStop([fileWith(LONG_COMMENT)], {}));
  assert.equal(out.decision, "block");
});

test("stop_hook_active passes", () => {
  assert.equal(runStop([fileWith(LONG_COMMENT)], { stop_hook_active: true }), "");
});

test("no edited files passes", () => {
  assert.equal(runStop([], {}), "");
});
