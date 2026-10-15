#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeHooks, type HookEntry } from "./dispatch.ts";

test("two Stop children both block: reasons join into one decision", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/a.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "A blocks" }));`);
  writeFileSync(`${dir}/b.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "B blocks" }));`);
  const hooks: HookEntry[] = [
    { event: "Stop", command: ["node", `${dir}/a.mjs`], enabled: true },
    { event: "Stop", command: ["node", `${dir}/b.mjs`], enabled: true },
  ];
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks);
  assert.deepEqual(JSON.parse(result), { decision: "block", reason: "A blocks\n\nB blocks" });
});

test("PreToolUse deny beats allow", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(
    `${dir}/allow.mjs`,
    `console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" } }));`,
  );
  writeFileSync(
    `${dir}/deny.mjs`,
    `console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "denied because X" } }));`,
  );
  const hooks: HookEntry[] = [
    { event: "PreToolUse", command: ["node", `${dir}/allow.mjs`], enabled: true },
    { event: "PreToolUse", command: ["node", `${dir}/deny.mjs`], enabled: true },
  ];
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir };
  const result = executeHooks(input, hooks);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "denied because X" },
  });
});

test("PreToolUse updatedInput chains to the next child and reaches the final output", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const seenPath = `${dir}/seen.json`;
  writeFileSync(
    `${dir}/rewrite.mjs`,
    `console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { command: "ls -la" } } }));`,
  );
  writeFileSync(
    `${dir}/observe.mjs`,
    `import { readFileSync, writeFileSync } from "node:fs";
     const input = JSON.parse(readFileSync(0, "utf8"));
     writeFileSync("${seenPath}", JSON.stringify(input.tool_input));`,
  );
  const hooks: HookEntry[] = [
    { event: "PreToolUse", command: ["node", `${dir}/rewrite.mjs`], enabled: true },
    { event: "PreToolUse", command: ["node", `${dir}/observe.mjs`], enabled: true },
  ];
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir };
  const result = executeHooks(input, hooks);
  assert.deepEqual(JSON.parse(readFileSync(seenPath, "utf8")), { command: "ls -la" });
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { command: "ls -la" } },
  });
});

test("exit 2 with stderr becomes a block reason", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/deny.mjs`, `process.stderr.write("blocked: bad command"); process.exit(2);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/deny.mjs`], enabled: true }];
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks);
  assert.deepEqual(JSON.parse(result), { decision: "block", reason: "blocked: bad command" });
});

test("two additionalContext outputs merge", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(
    `${dir}/a.mjs`,
    `console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "context A" } }));`,
  );
  writeFileSync(
    `${dir}/b.mjs`,
    `console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "context B" } }));`,
  );
  const hooks: HookEntry[] = [
    { event: "SessionStart", command: ["node", `${dir}/a.mjs`], enabled: true },
    { event: "SessionStart", command: ["node", `${dir}/b.mjs`], enabled: true },
  ];
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "context A\n\ncontext B" },
  });
});

test("enabled: false is skipped", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/skip.mjs`], enabled: false }];
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("matcher Bash skips tool_name Edit", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "PreToolUse", matcher: "Bash", command: ["node", `${dir}/skip.mjs`], enabled: true }];
  const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "x.ts" }, cwd: dir };
  const result = executeHooks(input, hooks);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("plain stdout on SessionStart becomes additionalContext", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/greet.mjs`, `console.log("hello from session start");`);
  const hooks: HookEntry[] = [{ event: "SessionStart", command: ["node", `${dir}/greet.mjs`], enabled: true }];
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hello from session start" },
  });
});

test("exit 1 with stderr shows up in systemMessage", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/oops.mjs`, `process.stderr.write("oops"); process.exit(1);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/oops.mjs`], enabled: true }];
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks);
  assert.deepEqual(JSON.parse(result), { systemMessage: "[hook oops.mjs failed, exit 1] oops" });
});

test("Stop with nothing to say returns empty string", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/quiet.mjs`, `process.exit(0);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/quiet.mjs`], enabled: true }];
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks);
  assert.equal(result, "");
});
