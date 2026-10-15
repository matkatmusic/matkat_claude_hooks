#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tmpdir } from "node:os";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import type { Sitting } from "../shared/session-state.ts";

process.env.CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT = "/private/tmp";
process.env.CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS = "14";
const { applyEvent, sumTranscriptTokens } = await import("./turn-counter.ts");

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
  assert.deepEqual(await sumTranscriptTokens(scratch), { in: 15, out: 5 });
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
  assert.deepEqual(await sumTranscriptTokens(parent), { in: 110, out: 42 });
  await unlink(sidecar);
  await unlink(parent);
});

test("no transcript path", async () => {
  assert.equal(await sumTranscriptTokens(undefined), undefined);
});

test("missing transcript file", async () => {
  assert.equal(await sumTranscriptTokens("/no/such/file.jsonl"), undefined);
});
