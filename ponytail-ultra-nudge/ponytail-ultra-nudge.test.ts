#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { ponytailUltraInvoked } from "./ponytail-ultra-nudge.ts";

test("typed command ultra", () => {
  const line = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: "<command-message>ponytail:ponytail</command-message>\n<command-name>/ponytail:ponytail</command-name>\n<command-args>ultra</command-args>",
    },
  });
  assert.equal(ponytailUltraInvoked(line), true);
});

test("typed command full", () => {
  const line = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: "<command-message>ponytail:ponytail</command-message>\n<command-name>/ponytail:ponytail</command-name>\n<command-args>full</command-args>",
    },
  });
  assert.equal(ponytailUltraInvoked(line), false);
});

const runHook = (home: string, transcriptPath: string) =>
  execFileSync("node", [`${import.meta.dirname}/ponytail-ultra-nudge.ts`], {
    input: JSON.stringify({ transcript_path: transcriptPath }),
    env: { ...process.env, HOME: home },
  });

test("state already marks ponytail ultra invoked: exits with no output, transcript is never read", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const dir = `${home}/.claude/.dotfiles`;
  mkdirSync(dir, { recursive: true });
  const transcriptPath = `${home}/no-such-transcript.jsonl`;
  writeFileSync(`${dir}/no-such-transcript.json`, JSON.stringify({ ponytailUltraInvoked: true }));

  const output = runHook(home, transcriptPath);
  assert.equal(output.toString(), "");
});

test("transcript shows the typed ultra command: writes the state key", () => {
  const home = mkdtempSync(`${tmpdir()}/ponytail-nudge-`);
  const transcriptPath = `${home}/session-a.jsonl`;
  const line = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: "<command-message>ponytail:ponytail</command-message>\n<command-name>/ponytail:ponytail</command-name>\n<command-args>ultra</command-args>",
    },
  });
  writeFileSync(transcriptPath, line);

  runHook(home, transcriptPath);
  const state = JSON.parse(readFileSync(`${home}/.claude/.dotfiles/session-a.json`, "utf8"));
  assert.equal(state.ponytailUltraInvoked, true);
});
