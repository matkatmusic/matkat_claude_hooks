#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS = "15";
const { isAmbiguous } = await import("./clarify-ambiguous.ts");

test("bad stdin JSON exits non-zero", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("./clarify-ambiguous.ts", import.meta.url))], {
    input: "not json",
    env: { ...process.env, CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS: "15" },
  });
  assert.notEqual(result.status, 0);
});

test("isAmbiguous", () => {
  const cases: [boolean, string][] = [
    [false, "yes"],
    [false, "add a prefix to the handler name in src/config.ts"],
    [true, "fix the login bug"],
    [true, "do both"],
    [true, "go ahead"],
    [true, "proceed"],
    [false, "option A"],
    [false, "the second one"],
    [false, "typescript"],
    [false, "/jot park this idea for later"],
    [false, "add a newline to src/config.ts at the end of the emitted output"],
    [false, "clean up this file jdi"],
    [true, "fix the login bug and make sure the tests still pass afterward"],
    [true, "add a newline to the config"],
    [true, "make this better"],
  ];

  for (const [want, prompt] of cases) {
    assert.equal(isAmbiguous(prompt), want, `want=${want} prompt=${prompt}`);
  }
});
