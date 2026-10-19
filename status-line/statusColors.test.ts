import assert from "node:assert/strict";
import { test } from "node:test";
import { DASH, GREEN, ORANGE, RED, YELLOW, formatOrDash, selectBudgetColor, selectColor } from "./statusColors.ts";

test("selectColor: the value picks the color at each threshold", () => {
  assert.equal(selectColor(1, 10, 20, 30), GREEN);
  assert.equal(selectColor(10, 10, 20, 30), YELLOW);
  assert.equal(selectColor(20, 10, 20, 30), ORANGE);
  assert.equal(selectColor(30, 10, 20, 30), RED);
});

test("formatOrDash: a missing value gives the dash, a value gets rendered", () => {
  assert.equal(formatOrDash(undefined, String), DASH);
  assert.equal(formatOrDash(5, (value) => `n${value}`), "n5");
});

test("selectBudgetColor: red only when use reaches the budget", () => {
  assert.equal(selectBudgetColor(undefined, 50), "");
  assert.equal(selectBudgetColor(49, 50), "");
  assert.equal(selectBudgetColor(50, 50), RED);
});
