import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setEnablement, setValue } from "./run_stranger.ts";

function makeClone(): string {
  const clone = mkdtempSync(path.join(tmpdir(), "run-stranger-"));
  mkdirSync(path.join(clone, "dispatcher"));
  const userDispatch = { enablements: { "block-bash-edits": { PreToolUse: true } }, values: { shared: { KEY: "old" } } };
  writeFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), JSON.stringify(userDispatch));
  return clone;
}

test("setEnablement changes one enablement and keeps the values", () => {
  const clone = makeClone();
  setEnablement(clone, "block-bash-edits", "PreToolUse", false);
  const written = JSON.parse(readFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), "utf8"));
  assert.equal(written.enablements["block-bash-edits"].PreToolUse, false);
  assert.equal(written.values.shared.KEY, "old");
});

test("setValue changes one value and keeps the enablements", () => {
  const clone = makeClone();
  setValue(clone, "shared", "KEY", "new");
  const written = JSON.parse(readFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), "utf8"));
  assert.equal(written.values.shared.KEY, "new");
  assert.equal(written.enablements["block-bash-edits"].PreToolUse, true);
});

test("exits with an error when --bed is missing", () => {
  const scriptPath = `${import.meta.dirname}/run_stranger.ts`;
  const result = spawnSync("bun", [scriptPath], {
    encoding: "utf8",
    env: { ...process.env, TMUX_PANE: "%999", BUN_JSC_useTailCalls: "0" },
  });
  assert.notEqual(result.status, 0);
  assert.ok(result.stderr.includes("--bed is required"));
});
