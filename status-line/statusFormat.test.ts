import assert from "node:assert/strict";
import { test } from "node:test";
import { computeDayOfWeek, computeSecondsUntilReset, formatBar, formatCountdown, formatTokens } from "./statusFormat.ts";

test("formatTokens: plain, thousands, millions", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(75000), "75.0K");
  assert.equal(formatTokens(1234567), "1.2M");
});

test("formatBar and formatCountdown: fixed width output", () => {
  assert.equal(formatBar(42), "████░░░░░░");
  assert.equal(formatBar(150), "██████████");
  assert.equal(formatCountdown(5400), "01:30:00");
});

test("computeSecondsUntilReset and computeDayOfWeek: handle missing and numeric input", () => {
  assert.equal(computeSecondsUntilReset(undefined, 100), 0);
  assert.equal(computeSecondsUntilReset(160, 100), 60);
  assert.equal(computeDayOfWeek(0), 7);
  assert.equal(computeDayOfWeek(6.5 * 86400), 1);
});
