import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const STATUS_PATH = join(import.meta.dirname, "status.ts");
const RED = "\x1b[31m";

function runScript(scriptPath: string, input: object, stateDir: string) {
  const result = spawnSync("node", [scriptPath], {
    input: JSON.stringify(input),
    env: { ...process.env, CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir },
    encoding: "utf8",
  });
  return result;
}

function makeStatusInput(displayName: string) {
  return { session_id: "sess-1", model: { id: "x", display_name: displayName }, workspace: { current_dir: tmpdir() } };
}

test("hooks.json: both status lines refresh on a timer", () => {
  const settings = JSON.parse(readFileSync(join(import.meta.dirname, "hooks.json"), "utf8"));
  assert.equal(typeof settings.statusLine.refreshInterval, "number");
  assert.equal(typeof settings.subagentStatusLine.refreshInterval, "number");
});

test("turn-counter not wired: line shows a red marker instead of 0 turns and dashes", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "status-line-test-"));
  const result = runScript(STATUS_PATH, makeStatusInput("Opus 5"), stateDir);
  assert.equal(result.status, 0);
  const lines = result.stdout.split("\n");
  const countersLine = lines[1];
  assert.ok(countersLine.includes(RED));
  assert.ok(!countersLine.includes(" 0 turns"));
  assert.ok(!countersLine.includes("Tokens In:"));
});

test("turn-counter wired: line shows the turn count and tokens", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "status-line-test-"));
  writeFileSync(join(stateDir, "sess-1.json"), JSON.stringify({ sittings: [{ start: 1, turns: 3, end: "", tokensIn: 100, tokensOut: 10 }] }));
  const result = runScript(STATUS_PATH, makeStatusInput("Opus 5"), stateDir);
  const countersLine = result.stdout.split("\n")[1];
  assert.ok(countersLine.includes("3 turns"));
  assert.ok(countersLine.includes("Tokens In:"));
});

test("unknown model: the first line shows the error text, the other lines still print", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "status-line-test-"));
  const result = runScript(STATUS_PATH, makeStatusInput("Nova 9"), stateDir);
  assert.equal(result.status, 0);
  const lines = result.stdout.split("\n");
  assert.ok(lines[0].includes("Nova 9"));
  assert.ok(lines[0].includes(RED));
  assert.ok(lines.length > 2);
});
