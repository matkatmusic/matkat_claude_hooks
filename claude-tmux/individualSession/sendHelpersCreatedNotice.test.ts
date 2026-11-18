import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

test("test_sendHelpersCreatedNotice_throws_without_a_helper_name", () => {
    // Step 1: run the script with a pane and a chat name but no helper name.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/sendHelpersCreatedNotice.ts`, "%999", "bed 1"], { encoding: "utf8" });
    // Step 2: the script fails and prints the usage line.
    assert.notEqual(scriptResult.status, 0);
    assert.match(scriptResult.stderr, /usage: sendHelpersCreatedNotice.ts/);
});
