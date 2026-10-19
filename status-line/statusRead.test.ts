import assert from "node:assert/strict";
import { test } from "node:test";
import { countTurns, getSessionTokens } from "./statusRead.ts";

test("countTurns: sums turns and counts a missing field as zero", () => {
  assert.equal(countTurns([]), 0);
  assert.equal(countTurns([{ turns: 3 }, { turns: 4 }]), 7);
  assert.equal(countTurns([{}, { turns: 2 }]), 2);
});

test("getSessionTokens: only the latest sitting counts", () => {
  assert.equal(getSessionTokens([]), undefined);
  assert.deepEqual(getSessionTokens([{ tokensIn: 100, tokensOut: 10 }, { tokensIn: 250, tokensOut: 40 }]), { in: 250, out: 40 });
});
