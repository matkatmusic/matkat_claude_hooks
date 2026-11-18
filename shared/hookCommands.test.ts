#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const SKIPPED_FOLDER_NAMES = ["node_modules", ".git"];
const SKIPPED_RELATIVE_FOLDERS = ["tests/external/tmux_lib", "typesafe-template/mod/typesafe-checks"];
const JAVASCRIPT_RUNTIMES = ["bun", "node"];

function findHooksJsonFiles(folder: string, relativeFolder: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(folder, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = relativeFolder === "" ? entry.name : `${relativeFolder}/${entry.name}`;
    if (entry.isDirectory()) {
      const isSkippedName = SKIPPED_FOLDER_NAMES.includes(entry.name);
      const isSkippedSubmodule = SKIPPED_RELATIVE_FOLDERS.includes(relativePath);
      if (isSkippedName) continue;
      if (isSkippedSubmodule) continue;
      found.push(...findHooksJsonFiles(join(folder, entry.name), relativePath));
    }
    else {
      if (entry.name === "hooks.json") found.push(relativePath);
    }
  }
  return found;
}

function collectCommandStrings(value: unknown, commands: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCommandStrings(item, commands);
    return;
  }
  if (value === null) return;
  if (typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "command") {
      if (typeof child === "string") commands.push(child);
    }
    collectCommandStrings(child, commands);
  }
}

test("test_every_hooks_json_command_has_a_space_after_the_program_name", () => {
  // Step: find every hooks.json in the repo, skipping node_modules and the two submodules.
  const hooksJsonFiles = findHooksJsonFiles(REPO_ROOT, "");
  assert.ok(hooksJsonFiles.length > 0, "no hooks.json files found");
  // Step: for each command that starts with bun or node, the next character must be a space.
  const badCommands: string[] = [];
  for (const relativePath of hooksJsonFiles) {
    const commands: string[] = [];
    collectCommandStrings(JSON.parse(readFileSync(join(REPO_ROOT, relativePath), "utf8")), commands);
    for (const command of commands) {
      for (const runtime of JAVASCRIPT_RUNTIMES) {
        if (command.startsWith(runtime)) {
          if (command[runtime.length] !== " ") badCommands.push(`${relativePath}: ${command}`);
        }
      }
    }
  }
  assert.deepEqual(badCommands, []);
});

test("test_every_dispatch_json_hook_runs_with_bun", () => {
  // Step: read every hook entry in dispatcher/dispatch.json.
  const dispatchJson = JSON.parse(readFileSync(join(REPO_ROOT, "dispatcher/dispatch.json"), "utf8"));
  // Step: each command array that starts with a JavaScript runtime must start with bun.
  const badCommands: string[] = [];
  for (const hook of dispatchJson.hooks) {
    const program = hook.command[0];
    if (JAVASCRIPT_RUNTIMES.includes(program)) {
      if (program !== "bun") badCommands.push(JSON.stringify(hook.command));
    }
  }
  assert.deepEqual(badCommands, []);
});
