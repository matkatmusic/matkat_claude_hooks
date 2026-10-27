#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import type { Sitting } from "../shared/session-state.ts";

const SCRATCH_ROOT = "/private/tmp";
const { applyEvent, countTranscriptTokens } = await import("./turn-counter.ts");

const events = [
  "SessionStart",
  "Stop",
  "Stop",
  "StopFailure",
  "SessionEnd",
  "SessionStart",
  "Stop",
];

let sittings: Sitting[] = [];
let clock = 1000;
for (const event of events) sittings = applyEvent(sittings, event, clock++);

test("resume appends a second sitting", () => {
  assert.equal(sittings.length, 2);
});

test("failed turns count too", () => {
  assert.equal(sittings[0].turns, 3);
});

test("SessionEnd stamps the sitting it closes", () => {
  assert.equal(sittings[0].end, 1004);
});

test("the live sitting has no end yet", () => {
  assert.equal(sittings[1].end, "");
});

test("status line sums turns across sittings", () => {
  const total = sittings.reduce((sum, s) => sum + s.turns, 0);
  assert.equal(total, 4);
});

test("a Stop with no sitting is ignored", () => {
  assert.deepEqual(applyEvent([], "Stop", 1), []);
});

test("other events change nothing", () => {
  assert.deepEqual(applyEvent(sittings, "PreToolUse", 1), sittings);
});

test("a resync stamps its tokens onto the current sitting, overwriting the prior total", () => {
  let withTokens = applyEvent([], "SessionStart", 1);
  withTokens = applyEvent(withTokens, "Stop", 2, { in: 100, out: 20 });
  assert.deepEqual(withTokens[0], { start: 1, turns: 1, end: "", tokensIn: 100, tokensOut: 20 });
  withTokens = applyEvent(withTokens, "Stop", 3, { in: 150, out: 35 });
  assert.equal(withTokens[0].tokensIn, 150, "resync overwrites, doesn't add");
  withTokens = applyEvent(withTokens, "Stop", 4);
  assert.equal(withTokens[0].tokensIn, 150, "no tokens passed leaves the prior totals in place");
});

const goodLine = (id: string, inTok: number, outTok: number) =>
  JSON.stringify({ message: { id, usage: { input_tokens: inTok, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: outTok } } });

test("sums good lines once each, skips the rest", async () => {
  const scratch = `${tmpdir()}/turn-counter-test-${Date.now()}.jsonl`;
  await writeFile(
    scratch,
    [
      goodLine("msg_1", 10, 2),
      JSON.stringify({ message: {} }),
      "not json",
      goodLine("msg_2", 5, 3),
      goodLine("msg_1", 10, 2), // Claude Code re-logs the same message while streaming
      "",
    ].join("\n"),
  );
  assert.deepEqual(await countTranscriptTokens(scratch, SCRATCH_ROOT), { in: 15, out: 5 });
  await unlink(scratch);
});

// Subagent and workflow tokens live in sibling files, and must be counted without double-counting
test("adds subagent files and dedupes ids shared with the parent", async () => {
  const sessionId = `sess-${Date.now()}`;
  const parent = `${tmpdir()}/${sessionId}.jsonl`;
  const sidecar = `${tmpdir()}/${sessionId}/subagents/agent-x.jsonl`;
  await mkdir(`${tmpdir()}/${sessionId}/subagents`, { recursive: true });
  await writeFile(parent, [goodLine("msg_a", 10, 2)].join("\n"));
  await writeFile(
    sidecar,
    [
      goodLine("msg_b", 100, 40),
      goodLine("msg_a", 10, 2), // already counted in the parent
    ].join("\n"),
  );
  assert.deepEqual(await countTranscriptTokens(parent, SCRATCH_ROOT), { in: 110, out: 42 });
  await unlink(sidecar);
  await unlink(parent);
});

test("a Stop that follows a Stop-hook block is not counted", () => {
  const stateDir = mkdtempSync(`${tmpdir()}/turn-counter-state-`);
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const settings = { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir, CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT: SCRATCH_ROOT, CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS: "14" };
  const runEvent = (input: object) =>
    spawnSync("node", [`${import.meta.dirname}/turn-counter.ts`], {
      input: JSON.stringify({ session_id: sessionId, settings, ...input }),
      encoding: "utf8",
    });
  runEvent({ hook_event_name: "SessionStart" });
  runEvent({ hook_event_name: "Stop", stop_hook_active: false });
  runEvent({ hook_event_name: "Stop", stop_hook_active: true });
  const state = JSON.parse(readFileSync(`${stateDir}/${sessionId}.json`, "utf8"));
  rmSync(stateDir, { recursive: true, force: true });
  assert.equal(state.sittings[0].turns, 1);
});

test("SessionEnd keeps the tokens from the last Stop and sets end", async () => {
  const stateDir = mkdtempSync(`${tmpdir()}/turn-counter-state-`);
  const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const transcript = `${stateDir}/${sessionId}.jsonl`;
  const settings = { CLAUDE_HOOKS_SESSION_STATE_DIR: stateDir, CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT: SCRATCH_ROOT, CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS: "14" };
  const runEvent = (input: object) =>
    spawnSync("node", [`${import.meta.dirname}/turn-counter.ts`], {
      input: JSON.stringify({ session_id: sessionId, transcript_path: transcript, settings, ...input }),
      encoding: "utf8",
    });
  await writeFile(transcript, goodLine("msg_1", 10, 2));
  runEvent({ hook_event_name: "SessionStart" });
  runEvent({ hook_event_name: "Stop" });
  await writeFile(transcript, [goodLine("msg_1", 10, 2), goodLine("msg_2", 50, 7)].join("\n"));
  runEvent({ hook_event_name: "SessionEnd" });
  const state = JSON.parse(readFileSync(`${stateDir}/${sessionId}.json`, "utf8"));
  rmSync(stateDir, { recursive: true, force: true });
  assert.equal(state.sittings[0].tokensIn, 10);
  assert.equal(state.sittings[0].tokensOut, 2);
  assert.equal(typeof state.sittings[0].end, "number");
});

test("no transcript path", async () => {
  assert.equal(await countTranscriptTokens(undefined, SCRATCH_ROOT), undefined);
});

test("missing transcript file", async () => {
  assert.equal(await countTranscriptTokens("/no/such/file.jsonl", SCRATCH_ROOT), undefined);
});
