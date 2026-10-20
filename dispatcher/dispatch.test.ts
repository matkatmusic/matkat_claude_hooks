#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeHooks, type HookEntry } from "./dispatch.ts";

test("two Stop children both block: reasons join into one decision", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/a.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "A blocks" }));`);
  writeFileSync(`${dir}/b.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "B blocks" }));`);
  const hooks: HookEntry[] = [
    { event: "Stop", command: ["node", `${dir}/a.mjs`] },
    { event: "Stop", command: ["node", `${dir}/b.mjs`] },
  ];
  const settings = { defaults: { enablements: { a: { Stop: true }, b: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
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
    { event: "PreToolUse", command: ["node", `${dir}/allow.mjs`] },
    { event: "PreToolUse", command: ["node", `${dir}/deny.mjs`] },
  ];
  const settings = { defaults: { enablements: { allow: { PreToolUse: true }, deny: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir };
  const result = executeHooks(input, hooks, settings);
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
    { event: "PreToolUse", command: ["node", `${dir}/rewrite.mjs`] },
    { event: "PreToolUse", command: ["node", `${dir}/observe.mjs`] },
  ];
  const settings = { defaults: { enablements: { rewrite: { PreToolUse: true }, observe: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir };
  const result = executeHooks(input, hooks, settings);
  assert.deepEqual(JSON.parse(readFileSync(seenPath, "utf8")), { command: "ls -la" });
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { command: "ls -la" } },
  });
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
    { event: "SessionStart", command: ["node", `${dir}/a.mjs`] },
    { event: "SessionStart", command: ["node", `${dir}/b.mjs`] },
  ];
  const settings = { defaults: { enablements: { a: { SessionStart: true }, b: { SessionStart: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "context A\n\ncontext B" },
  });
});
