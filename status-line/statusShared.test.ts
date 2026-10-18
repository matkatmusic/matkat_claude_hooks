import assert from "node:assert/strict";
import { test } from "node:test";
import { EFFORT_ABBREVIATION, formatModelName, formatShortModelName } from "./statusShared.ts";

test("formatShortModelName: display names from the live status line, unknown throws", () => {
  assert.equal(formatShortModelName("Opus 5"), "opus5");
  assert.equal(formatShortModelName("Opus 5 (1M context)"), "opus5[1m]");
  assert.equal(formatShortModelName("Opus 4.7 (1M context)"), "opus4.7[1m]");
  assert.equal(formatShortModelName("Fable 5.1"), "fable5.1");
  assert.equal(formatShortModelName("Sonnet 5"), "sonnet5[1m]");
  assert.equal(formatShortModelName("Opus 5.5"), "opus5.5");
  assert.equal(formatShortModelName("Sonnet 5.5"), "sonnet5.5[1m]");
  assert.equal(formatShortModelName("Haiku 5.5"), "haiku5.5");
  assert.equal(formatShortModelName(formatModelName("claude-fable-5-1")), "fable5.1");
  assert.equal(formatShortModelName(formatModelName("claude-opus-5-5")), "opus5.5");
  assert.equal(formatShortModelName(formatModelName("claude-sonnet-5-5")), "sonnet5.5[1m]");
  assert.equal(formatShortModelName(formatModelName("claude-haiku-5-5")), "haiku5.5");
  assert.throws(() => formatShortModelName("Opus"), /Opus/);
  assert.throws(() => formatShortModelName(undefined), /undefined/);
});

test("effort abbreviations, model names, unknown model throws", () => {
  assert.deepEqual(EFFORT_ABBREVIATION, { low: "L", medium: "M", high: "H", xhigh: "x", max: "max" });
  assert.equal(formatModelName("claude-opus-5"), "Opus 5");
  assert.equal(formatModelName("claude-haiku-4-5-20251001"), "Haiku 4.5");
  assert.equal(formatModelName("claude-sonnet-5[1m]"), "Sonnet 5 (1M context)");
  assert.equal(formatModelName("claude-opus-4-7[1m]"), "Opus 4.7 (1M context)");
  // assert.equal(formatShortModelName(formatModelName("claude-sonnet-5[1m]")), "sonnet5[1m]");
  assert.equal(formatShortModelName(formatModelName("claude-opus-5")), "opus5");
  assert.throws(() => formatModelName("claude-nope-9"), /claude-nope-9/);
  assert.throws(() => formatModelName("claude-nope-9[1m]"), /claude-nope-9\[1m\]/);
});
