#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { executeHooks, type HookEntry } from "./dispatch.ts";
import { readSettings, getHooks, DISPATCHER_DIR } from "../shared/settings.ts";

test("exit 2 with stderr becomes a block reason", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/deny.mjs`, `process.stderr.write("blocked: bad command"); process.exit(2);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/deny.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { deny: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), { decision: "block", reason: "blocked: bad command" });
});

test("a hook disabled in settings does not run", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/skip.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { skip: { Stop: false } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("matcher Bash skips tool_name Edit", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  const markerPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/skip.mjs`, `import { writeFileSync } from "node:fs"; writeFileSync("${markerPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "PreToolUse", matcher: "Bash", command: ["node", `${dir}/skip.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { skip: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "x.ts" }, cwd: dir };
  const result = executeHooks(input, hooks, settings);
  assert.equal(existsSync(markerPath), false);
  assert.equal(result, "");
});

test("plain stdout on SessionStart becomes additionalContext", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/greet.mjs`, `console.log("hello from session start");`);
  const hooks: HookEntry[] = [{ event: "SessionStart", command: ["node", `${dir}/greet.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { greet: { SessionStart: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "SessionStart", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "hello from session start" },
  });
});

test("exit 1 with stderr shows up in systemMessage", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/oops.mjs`, `process.stderr.write("oops"); process.exit(1);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/oops.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { oops: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
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
    defaults: { debugLoggingEnabled: false, enablements: { echo: { Stop: true } }, values: { shared: { SHARED_KEY: "from-shared" }, echo: { ECHO_KEY: "from-echo" } }, hooks: [] },
    user: { enablements: {}, values: {}, hooks: [] },
    dispatcherDir: dir,
  };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.deepEqual(JSON.parse(result), { systemMessage: "from-echo|from-shared" });
});

test("Stop with nothing to say returns empty string", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  writeFileSync(`${dir}/quiet.mjs`, `process.exit(0);`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/quiet.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { quiet: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const result = executeHooks({ hook_event_name: "Stop", cwd: dir }, hooks, settings);
  assert.equal(result, "");
});

function executeHookAndGetLogRoot(scriptText: string, hookName: string): string {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  mkdirSync(`${dir}/.git`);
  writeFileSync(`${dir}/${hookName}.mjs`, scriptText);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/${hookName}.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { [hookName]: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  executeHooks({ hook_event_name: "Stop", session_id: "sess-1", cwd: dir }, hooks, settings);
  return dir;
}

test("a failing hook writes one log line under .claude_hooks/logs", () => {
  const dir = executeHookAndGetLogRoot(`process.stderr.write("oops"); process.exit(1);`, "failing");
  const days = readdirSync(`${dir}/.claude_hooks/logs`);
  const logText = readFileSync(`${dir}/.claude_hooks/logs/${days[0]}/failing.log`, "utf8");
  assert.match(logText, /^\S+ session=sess-1 event=Stop exit-code: exit 1: oops\n$/);
});

test("exit 2 writes no log", () => {
  const dir = executeHookAndGetLogRoot(`process.stderr.write("blocked"); process.exit(2);`, "blocker");
  assert.equal(existsSync(`${dir}/.claude_hooks`), false);
});

function executeHookWithDebugSetting(debugLoggingEnabled: boolean): string {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  mkdirSync(`${dir}/.git`);
  writeFileSync(`${dir}/echo.mjs`, `process.stdout.write("hello"); process.stderr.write("warn");`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/echo.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled, enablements: { echo: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  executeHooks({ hook_event_name: "Stop", session_id: "sess-1", cwd: dir }, hooks, settings);
  return dir;
}

test("debug logging off writes no debug log", () => {
  const dir = executeHookWithDebugSetting(false);
  assert.equal(existsSync(`${dir}/.claude_hooks/debug`), false);
});

test("debug logging on writes one line with the input and output of the hook", () => {
  const dir = executeHookWithDebugSetting(true);
  const lines = readFileSync(`${dir}/.claude_hooks/debug/sess-1.jsonl`, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);
  assert.equal(entry.source, "echo");
  assert.equal(entry.event, "Stop");
  assert.equal(entry.kind, "dispatched-hook");
  assert.deepEqual(entry.input, { hook_event_name: "Stop", session_id: "sess-1", cwd: dir, settings: {} });
  assert.equal(entry.stdout, "hello");
  assert.equal(entry.stderr, "warn");
  assert.equal(entry.status, 0);
  assert.equal(entry.signal, null);
  assert.match(entry.time, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(readFileSync(`${dir}/.gitignore`, "utf8"), ".claude_hooks/\n");
});

test(".gitignore gets .claude_hooks/ once across two failures", () => {
  const dir = executeHookAndGetLogRoot(`process.exit(1);`, "failing");
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { failing: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/failing.mjs`] }];
  executeHooks({ hook_event_name: "Stop", session_id: "sess-1", cwd: dir }, hooks, settings);
  assert.equal(readFileSync(`${dir}/.gitignore`, "utf8"), ".claude_hooks/\n");
});

test("Stop and SubagentStop hooks are skipped while the session has a stop-hooks-off marker", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  mkdirSync(`${dir}/stop-hooks-off`);
  writeFileSync(`${dir}/stop-hooks-off/sess-1`, "");
  const ranPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/mark.mjs`, `import { appendFileSync } from "node:fs"; appendFileSync("${ranPath}", "ran");`);
  const hooks: HookEntry[] = [
    { event: "Stop", command: ["node", `${dir}/mark.mjs`] },
    { event: "SubagentStop", command: ["node", `${dir}/mark.mjs`] },
  ];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { mark: { Stop: true, SubagentStop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  executeHooks({ hook_event_name: "Stop", session_id: "sess-1", cwd: dir }, hooks, settings);
  executeHooks({ hook_event_name: "SubagentStop", session_id: "sess-1", cwd: dir }, hooks, settings);
  assert.equal(existsSync(ranPath), false);
});

test("Stop hooks run when the stop-hooks-off marker belongs to another session", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  mkdirSync(`${dir}/stop-hooks-off`);
  writeFileSync(`${dir}/stop-hooks-off/sess-2`, "");
  const ranPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/mark.mjs`, `import { appendFileSync } from "node:fs"; appendFileSync("${ranPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "Stop", command: ["node", `${dir}/mark.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { mark: { Stop: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  executeHooks({ hook_event_name: "Stop", session_id: "sess-1", cwd: dir }, hooks, settings);
  assert.equal(existsSync(ranPath), true);
});

test("a non-Stop hook still runs while the stop-hooks-off marker exists", () => {
  const dir = mkdtempSync(`${tmpdir()}/dispatch-`);
  mkdirSync(`${dir}/stop-hooks-off`);
  writeFileSync(`${dir}/stop-hooks-off/sess-1`, "");
  const ranPath = `${dir}/ran.txt`;
  writeFileSync(`${dir}/mark.mjs`, `import { appendFileSync } from "node:fs"; appendFileSync("${ranPath}", "ran");`);
  const hooks: HookEntry[] = [{ event: "PreToolUse", command: ["node", `${dir}/mark.mjs`] }];
  const settings = { defaults: { debugLoggingEnabled: false, enablements: { mark: { PreToolUse: true } }, values: {}, hooks: [] }, user: { enablements: {}, values: {}, hooks: [] }, dispatcherDir: dir };
  executeHooks({ hook_event_name: "PreToolUse", tool_name: "Bash", session_id: "sess-1", cwd: dir }, hooks, settings);
  assert.equal(existsSync(ranPath), true);
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
