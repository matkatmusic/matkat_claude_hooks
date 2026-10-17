#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";

test("non-hello prompt prints nothing", () => {
  const input = JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "nope", cwd: "/tmp" });
  const output = execFileSync("node", [`${import.meta.dirname}/key-push-probe.ts`], { input, encoding: "utf8" });
  assert.equal(output, "");
});
