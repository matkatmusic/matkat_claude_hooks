#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

test("test_bun_runs_a_hook_script_that_declares_an_enum", () => {
    // Scenario: a hook script with an enum runs under bun, the runner every hooks.json command now uses.
    // Steps:
    // run the fixture script the way hooks.json runs a hook: `bun <script>` with a JSON payload on stdin.
    const result = spawnSync("bun", [`${import.meta.dirname}/enumSupportFixture.ts`], { input: JSON.stringify({ mode: "fast" }), encoding: "utf8" });
    // the script exits with 0.
    assert.equal(result.status, 0, result.stderr);
    // the script prints the enum member value for the mode it read.
    assert.equal(result.stdout, "fast\n");
});
