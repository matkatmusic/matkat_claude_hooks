import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

test("exits with an error when --bed is missing", () => {
  const scriptPath = `${import.meta.dirname}/run_stranger.ts`;
  const result = spawnSync("bun", [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, TMUX_PANE: "%999", BUN_JSC_useTailCalls: "0" },
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("--bed is required"));
});
