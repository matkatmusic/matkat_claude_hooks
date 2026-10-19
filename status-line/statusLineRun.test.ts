import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const STATUS_PATH = join(import.meta.dirname, "status.ts");
const RED = "\x1b[31m";

function makeStatusTree(): string {
  const root = mkdtempSync(join(tmpdir(), "status-line-test-"));
  cpSync(join(import.meta.dirname, "..", "shared"), join(root, "shared"), { recursive: true });
  cpSync(import.meta.dirname, join(root, "status-line"), { recursive: true });
  mkdirSync(join(root, "dispatcher"));
  const dispatch = { enablements: {}, values: { shared: { CLAUDE_HOOKS_SESSION_STATE_DIR: join(root, "state") } }, hooks: [] };
  writeFileSync(join(root, "dispatcher", "dispatch.json"), JSON.stringify(dispatch));
  return root;
}

function makeSessionId(): string {
  return `status-line-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function runScript(scriptPath: string, input: object) {
  const result = spawnSync("node", [scriptPath], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return result;
}

function makeStatusInput(displayName: string, sessionId: string) {
  return { session_id: sessionId, model: { id: "x", display_name: displayName }, workspace: { current_dir: tmpdir() } };
}

test("hooks.json: both status lines refresh on a timer", () => {
  const settings = JSON.parse(readFileSync(join(import.meta.dirname, "hooks.json"), "utf8"));
  assert.equal(typeof settings.statusLine.refreshInterval, "number");
  assert.equal(typeof settings.subagentStatusLine.refreshInterval, "number");
});

test("turn-counter not wired: line shows a red marker instead of 0 turns and dashes", () => {
  const result = runScript(STATUS_PATH, makeStatusInput("Opus 5", makeSessionId()));
  assert.equal(result.status, 0);
  const lines = result.stdout.split("\n");
  const countersLine = lines[1];
  assert.ok(countersLine.includes(RED));
  assert.ok(!countersLine.includes(" 0 turns"));
  assert.ok(!countersLine.includes("Tokens In:"));
});

test("turn-counter wired: line shows the turn count and tokens", () => {
  const sessionId = makeSessionId();
  const root = makeStatusTree();
  mkdirSync(join(root, "state"));
  writeFileSync(join(root, "state", `${sessionId}.json`), JSON.stringify({ sittings: [{ start: 1, turns: 3, end: "", tokensIn: 100, tokensOut: 10 }] }));
  const result = runScript(join(root, "status-line", "status.ts"), makeStatusInput("Opus 5", sessionId));
  rmSync(root, { recursive: true, force: true });
  const countersLine = result.stdout.split("\n")[1];
  assert.ok(countersLine.includes("3 turns"));
  assert.ok(countersLine.includes("Tokens In:"));
});

test("unknown model: the first line shows the error text, the other lines still print", () => {
  const result = runScript(STATUS_PATH, makeStatusInput("Nova 9", makeSessionId()));
  assert.equal(result.status, 0);
  const lines = result.stdout.split("\n");
  assert.ok(lines[0].includes("Nova 9"));
  assert.ok(lines[0].includes(RED));
  assert.ok(lines.length > 2);
});
