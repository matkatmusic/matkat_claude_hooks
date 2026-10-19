import assert from "node:assert/strict";
import { test } from "node:test";
import { ANNOYANCE_COLORS, computeAnnoyanceLevel, resetColor } from "./statusAnnoyance.ts";

test("computeAnnoyanceLevel: no use is level 1, full use with no wait is level 3", () => {
  assert.equal(computeAnnoyanceLevel(0, 0), 1);
  assert.equal(computeAnnoyanceLevel(100, 0), 3);
});

test("computeAnnoyanceLevel: a longer wait never lowers the level", () => {
  assert.ok(computeAnnoyanceLevel(80, 150) >= computeAnnoyanceLevel(80, 0));
});

test("resetColor: the color matches the level", () => {
  assert.equal(resetColor(0, 0), ANNOYANCE_COLORS[0]);
  assert.equal(resetColor(0, 100), ANNOYANCE_COLORS[2]);
});
