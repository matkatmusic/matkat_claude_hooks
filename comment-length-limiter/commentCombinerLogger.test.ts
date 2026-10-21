// PostToolUse logger hook: records the edited file path in the session state. Run: node --test "*.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dirname, "commentCombinerLogger.ts");

const STATE_DIR = mkdtempSync(join(tmpdir(), "reflow-state-"));

function run(toolInput: object): string {
  return execFileSync("node", ["--no-inspect", SCRIPT], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: toolInput, transcript_path: "/t/post-session.jsonl", settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: STATE_DIR } }),
    encoding: "utf8", stdio: ["pipe", "pipe", "ignore"],
  });
}

function fileWith(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "reflow-post-")), "sample.ts");
  writeFileSync(path, contents);
  return path;
}

test("an edited file path is recorded once in the session state", () => {
  const path = fileWith("const x = 1;");
  run({ file_path: path });
  run({ file_path: path });
  const state = JSON.parse(readFileSync(join(STATE_DIR, "post-session.json"), "utf8"));
  let timesRecorded = 0;
  for (const recorded of state.editedFiles) {
    if (recorded === path)
      timesRecorded++;
  }
  assert.equal(timesRecorded, 1);
});

test("missing path or notebook edit: silent", () => {
  assert.equal(run({ notebook_path: "/nope/x.ipynb" }), "");
  assert.equal(run({ file_path: "/definitely/not/here.ts" }), "");
});
