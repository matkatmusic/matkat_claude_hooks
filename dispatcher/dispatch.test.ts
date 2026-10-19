#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeHooks, type HookEntry } from "./dispatch.ts";
import { readSettings, getHooks, DISPATCHER_DIR } from "../shared/settings.ts";

test("two Stop children both block: reasons join into one decision", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/a.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "A blocks" }));`);
  writeFileSync(`${dir}/b.mjs`, `console.log(JSON.stringify({ decision: "block", reason: "B blocks" }));`);
  const hooks: HookEntry[] = [
    { event: "Stop", command: ["node", `${dir}/a.mjs`] },
    { event: "Stop", command: ["node", `${dir}/b.mjs`] },
  ];
  const settings = { defaults: { enablements: { a: { Stop: true }, b: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
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
  const settings = { defaults: { enablements: { allow: { PreToolUse: true }, deny: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
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
  const settings = { defaults: { enablements: { rewrite: { PreToolUse: true }, observe: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "ls" }, cwd: dir };
  const result = executeHooks(input, hooks, settings);
  assert.deepEqual(JSON.parse(readFileSync(seenPath, "utf8")), { command: "ls -la" });
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: { command: "ls -la" } },
  });
});

test("exit 2 with stderr becomes a block reason", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/deny.mjs`, `process.stderr.write("blocked: bad command"); process.exit(2);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/deny.mjs`] }];
  const settings = { defaults: { enablements: { deny: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
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
    { event: "SessionStart", command: ["node", `${dir}/a.mjs`] },
    { event: "SessionStart", command: ["node", `${dir}/b.mjs`] },
  ];
  const settings = { defaults: { enablements: { a: { SessionStart: true }, b: { SessionStart: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "context A\n\ncontext B" },
  });
});

test("a hook disabled in settings does not run", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/skip.mjs`] }];
  const settings = { defaults: { enablements: { skip: { Stop: false } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("matcher Bash skips tool_name Edit", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "PreToolUse", matcher: "Bash", command: ["node", `${dir}/skip.mjs`] }];
  const settings = { defaults: { enablements: { skip: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "x.ts" }, cwd: dir };
  const result = executeHooks(input, hooks, settings);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("plain stdout on SessionStart becomes additionalContext", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/greet.mjs`, `console.log("hello from session start");`);
  const hooks: HookEntry[] = [{ event: "SessionStart", command: ["node", `${dir}/greet.mjs`] }];
  const settings = { defaults: { enablements: { greet: { SessionStart: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hello from session start" },
  });
});

test("exit 1 with stderr shows up in systemMessage", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/oops.mjs`, `process.stderr.write("oops"); process.exit(1);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/oops.mjs`] }];
  const settings = { defaults: { enablements: { oops: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), { systemMessage: "[hook oops.mjs failed, exit 1] oops" });
});

test("the child receives input.settings with its values from getValues", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(
    `${dir}/echo.mjs`,
    `import { readFileSync } from "node:fs";
     const input = JSON.parse(readFileSync(0, "utf8"));
     console.log(JSON.stringify({ systemMessage: input.settings.ECHO_KEY + "|" + input.settings.SHARED_KEY }));`,
  );
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/echo.mjs`] }];
  const settings = {
    defaults: { enablements: { echo: { Stop: true } }, values: { shared: { SHARED_KEY: "from-shared" }, echo: { ECHO_KEY: "from-echo" } }, hooks: [] },
    user: { enablements: {}, values: {}, hooks: [] },
  };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), { systemMessage: "from-echo|from-shared" });
});

test("Stop with nothing to say returns empty string", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/quiet.mjs`, `process.exit(0);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/quiet.mjs`] }];
  const settings = { defaults: { enablements: { quiet: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] } };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.equal(result, "");
});

test("every hook points at a script that exists", () => {
  const missingScripts: string[] = [];
  for (const entry of getHooks(readSettings(DISPATCHER_DIR))) {
    const scriptPath = entry.command[1];
    const scriptExists = existsSync(scriptPath);
    const isMissing = !scriptExists;
    if (isMissing) {
      missingScripts.push(scriptPath);
    }
  }
  assert.deepEqual(missingScripts, []);
});
