#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  ANNOYANCE_ANCHORS,
  TOKENS_YELLOW_AT,
  TOKENS_ORANGE_AT,
  TOKENS_RED_AT,
} from "./status_line_config.ts";

test("token thresholds rise from yellow to orange to red", () => {
  assert.ok(TOKENS_YELLOW_AT < TOKENS_ORANGE_AT);
  assert.ok(TOKENS_ORANGE_AT < TOKENS_RED_AT);
});

test("annoyance anchors list minutes in ascending order with five levels each", () => {
  for (let i = 0; i < ANNOYANCE_ANCHORS.length; i++) {
    assert.equal(ANNOYANCE_ANCHORS[i][1].length, 5);
    const hasPrevious = i > 0;
    if (!hasPrevious)
      continue;
    assert.ok(ANNOYANCE_ANCHORS[i - 1][0] < ANNOYANCE_ANCHORS[i][0]);
  }
});
