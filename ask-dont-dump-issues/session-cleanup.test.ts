#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const runHook = (home: string, sessionId: string) =>
  execFileSync("node", [`${import.meta.dirname}/session-cleanup.ts`], {
    input: JSON.stringify({ session_id: sessionId, hook_event_name: "SessionEnd" }),
    env: { ...process.env, HOME: home },
  });

test("clears this session's done and reminded keys, leaves other sessions alone", () => {
  const home = mkdtempSync(`${tmpdir()}/session-cleanup-`);
  const dir = `${home}/.claude/.dotfiles`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/s1.json`, JSON.stringify({ done: 1, reminded: 1 }));
  writeFileSync(`${dir}/other.json`, JSON.stringify({ done: 1 }));

  runHook(home, "s1");
  assert.deepEqual(JSON.parse(readFileSync(`${dir}/s1.json`, "utf8")), {});
  assert.deepEqual(JSON.parse(readFileSync(`${dir}/other.json`, "utf8")), { done: 1 });
});

test("clearing done and reminded keeps this session's other keys", () => {
  const home = mkdtempSync(`${tmpdir()}/session-cleanup-`);
  const dir = `${home}/.claude/.dotfiles`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/s1.json`, JSON.stringify({ done: 1, reminded: 1, sittings: [{ turns: 2 }] }));

  runHook(home, "s1");
  assert.deepEqual(JSON.parse(readFileSync(`${dir}/s1.json`, "utf8")), { sittings: [{ turns: 2 }] });
});

test("a session that never reached a Stop has no state file; nothing is created", () => {
  const home = mkdtempSync(`${tmpdir()}/session-cleanup-`);
  const dir = `${home}/.claude/.dotfiles`;
  mkdirSync(dir, { recursive: true });

  runHook(home, "never-ran");
  assert.equal(existsSync(`${dir}/never-ran.json`), false);
});

test("no .dotfiles folder at all: no crash, no folder created", () => {
  const home = mkdtempSync(`${tmpdir()}/session-cleanup-empty-`);

  runHook(home, "never-ran");
  assert.equal(existsSync(`${home}/.claude`), false);
});
