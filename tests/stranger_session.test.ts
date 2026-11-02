import assert from "node:assert/strict";
import { test } from "node:test";
import { isScreenIdle, launchSession } from "./stranger_session.ts";

test("isScreenIdle is true only with a prompt, no busy line and no dialog", () => {
  assert.equal(isScreenIdle("❯ "), true);
  assert.equal(isScreenIdle("❯ \nesc to interrupt"), false);
  assert.equal(isScreenIdle("❯ \nEsc to cancel"), false);
  assert.equal(isScreenIdle("no prompt here"), false);
});

test("launchSession takes a model, a bed and a config folder first", () => {
  assert.equal(launchSession.length, 3);
});
