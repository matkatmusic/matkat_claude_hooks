#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const { isFirstTurn, findUnreadFiles, findUnnamedFiles, collectReplyText, isReaderEnabled } = await import("./idle-state-check.ts");

function promptLine(): string {
  return JSON.stringify({ type: "user", message: { content: "hi" }, timestamp: "2026-10-16T11:42:00.000Z" });
}

function toolUseLine(name: string, input: object): string {
  return JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name, input }] } });
}

test("one prompt is the first turn", () => {
  assert.equal(isFirstTurn(promptLine()), true);
});

test("two prompts are not the first turn", () => {
  assert.equal(isFirstTurn([promptLine(), promptLine()].join("\n")), false);
});

test("only a Read of the file counts as read", () => {
  const files = ["/p/.idleState/2026-10-16-1142-aaaa1111.json", "/p/.idleState/2026-10-16-1143-bbbb2222.json", "/p/.idleState/2026-10-16-1144-cccc3333.json"];
  const transcript = [
    promptLine(),
    toolUseLine("Bash", { command: "cat /p/.idleState/2026-10-16-1142-aaaa1111.json" }),
    toolUseLine("Read", { file_path: files[1] }),
  ].join("\n");
  assert.deepEqual(findUnreadFiles(files, transcript), [files[0], files[2]]);
});

test("an ls that names the file does not count as read", () => {
  const files = ["/x/.idleState/2026-10-16-1142-25903e44.json"];
  const transcript = [
    promptLine(),
    toolUseLine("Bash", { command: "ls /x/.idleState/2026-10-16-1142-25903e44.json" }),
  ].join("\n");
  assert.deepEqual(findUnreadFiles(files, transcript), files);
});

test("a Read of a different file does not count as read", () => {
  const files = ["/x/.idleState/2026-10-16-1142-25903e44.json"];
  const transcript = [
    promptLine(),
    toolUseLine("Read", { file_path: "/x/other.json" }),
  ].join("\n");
  assert.deepEqual(findUnreadFiles(files, transcript), files);
});

test("a file name in a user prompt does not count as read", () => {
  const files = ["/p/.idleState/2026-10-16-1142-aaaa1111.json"];
  const transcript = JSON.stringify({ type: "user", message: { content: "2026-10-16-1142-aaaa1111.json" } });
  assert.deepEqual(findUnreadFiles(files, transcript), files);
});

test("a file counts as named when its name without .json is in the reply", () => {
  const files = ["/p/.idleState/2026-10-16-1142-aaaa1111.json", "/p/.idleState/2026-10-16-1143-bbbb2222.json"];
  assert.deepEqual(findUnnamedFiles(files, "I read 2026-10-16-1142-aaaa1111 and it says hello"), [files[1]]);
});

test("a file named in an earlier reply counts as named", () => {
  const files = ["/p/.idleState/2026-10-16-1142-aaaa1111.json"];
  const transcript = [
    promptLine(),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Recent work is in 2026-10-16-1142-aaaa1111" }] } }),
    toolUseLine("Bash", { command: "ls" }),
    JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Done." }] } }),
  ].join("\n");
  assert.deepEqual(findUnnamedFiles(files, collectReplyText(transcript)), []);
});

function writeHooksList(event: string): string {
  const listPath = `${mkdtempSync(`${tmpdir()}/idle-state-list-`)}/hooks-list.ts`;
  writeFileSync(listPath, `export const HOOKS = [{ event: "${event}", command: ["node", "/x/idle-state/idle-state-reader.ts"], enabled: true }];\n`);
  return listPath;
}

test("the reader counts as enabled when its entry is a UserPromptSubmit hook", async () => {
  process.env.CLAUDE_HOOKS_LIST = writeHooksList("UserPromptSubmit");
  assert.equal(await isReaderEnabled(), true);
});

test("the reader does not count as enabled when its entry is a SessionStart hook", async () => {
  process.env.CLAUDE_HOOKS_LIST = writeHooksList("SessionStart");
  assert.equal(await isReaderEnabled(), false);
});
