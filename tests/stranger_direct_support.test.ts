import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildHookEnv, countOccurrences, createContext, executeHook, formatFlag } from "./stranger_direct_support.ts";

test("buildHookEnv drops shell CLAUDE_HOOKS values and points state at the direct folder", () => {
  process.env.CLAUDE_HOOKS_PLANNING_GUIDE_PATH = "/should/be/dropped";
  const bed = mkdtempSync(path.join(tmpdir(), "direct-support-"));
  const context = createContext(bed, path.join(bed, "config"));
  const env = buildHookEnv(context, { CLAUDE_CODE_TASK_LIST_ID: "abc" });
  assert.equal(env.CLAUDE_HOOKS_PLANNING_GUIDE_PATH, undefined);
  assert.equal(env.CLAUDE_HOOKS_SESSION_STATE_DIR, path.join(bed, "direct", "state"));
  assert.equal(env.CLAUDE_CODE_TASK_LIST_ID, "abc");
});

test("executeHook feeds stdin to a clone script and returns its output", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "direct-support-"));
  const repo = path.resolve(import.meta.dirname, "..");
  const context = { ...createContext(bed, bed), clone: repo };
  const input = { tool_name: "Bash", tool_input: { command: "make 2> err.log" } };
  const run = executeHook(context, "block-bash-edits/block-bash-edits.ts", input, bed);
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('"permissionDecision":"deny"'));
});

test("countOccurrences and formatFlag", () => {
  assert.equal(countOccurrences("a-b-a-c-a", "a"), 3);
  assert.equal(formatFlag(true), "yes");
  assert.equal(formatFlag(false), "no");
});
