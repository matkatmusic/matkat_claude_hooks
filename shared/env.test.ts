import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readEnvValue } from "./env.ts";

test("readEnvValue throws for a missing name", () => {
  assert.throws(() => readEnvValue("CLAUDE_HOOKS_NOT_SET"), /claude_hooks: set CLAUDE_HOOKS_NOT_SET in .env/);
});
