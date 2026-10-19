import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { addUnknownHook, copyUntrackedFiles, readDispatchTexts, removeEnablement, writeDispatchTexts, setEnablement, setValue } from "./run_stranger.ts";

function makeDispatchClone(): string {
  const clone = mkdtempSync(path.join(tmpdir(), "run-stranger-dispatch-"));
  mkdirSync(path.join(clone, "dispatcher"));
  const settings = { enablements: { "hook-a": { Stop: true, SubagentStop: false } }, values: {} };
  writeFileSync(path.join(clone, "dispatcher", "dispatch.json"), JSON.stringify(settings));
  writeFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), JSON.stringify(settings));
  return clone;
}

test("copyUntrackedFiles copies untracked files and skips ignored ones", () => {
  const repo = mkdtempSync(path.join(tmpdir(), "run-stranger-repo-"));
  const clone = mkdtempSync(path.join(tmpdir(), "run-stranger-copy-"));
  spawnSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\n");
  mkdirSync(path.join(repo, "sub"));
  writeFileSync(path.join(repo, "sub", "new.md"), "new");
  writeFileSync(path.join(repo, "ignored.txt"), "no");
  copyUntrackedFiles(repo, clone);
  assert.equal(readFileSync(path.join(clone, "sub", "new.md"), "utf8"), "new");
  assert.equal(existsSync(path.join(clone, "ignored.txt")), false);
});

test("removeEnablement removes one event from both files", () => {
  const clone = makeDispatchClone();
  removeEnablement(clone, "hook-a", "Stop");
  for (const fileName of ["dispatch.json", "user-dispatch.json"]) {
    const written = JSON.parse(readFileSync(path.join(clone, "dispatcher", fileName), "utf8"));
    assert.equal("Stop" in written.enablements["hook-a"], false);
    assert.equal(written.enablements["hook-a"].SubagentStop, false);
  }
});

test("addUnknownHook adds a hook name and writeDispatchTexts undoes it", () => {
  const clone = makeDispatchClone();
  const saved = readDispatchTexts(clone);
  addUnknownHook(clone, "no-such-hook");
  const changed = JSON.parse(readFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), "utf8"));
  assert.equal(changed.enablements["no-such-hook"].Stop, true);
  writeDispatchTexts(clone, saved);
  assert.deepEqual(readDispatchTexts(clone), saved);
});

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
