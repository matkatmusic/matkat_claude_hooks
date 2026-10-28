import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export const DEFAULT_SETTINGS = { CLAUDE_HOOKS_BLOCKED_EDITS_DIR: `${tmpdir()}/claude-blocked-edits` };

export function readSavedBlockedEditPath(denyReason: string): string {
  const match = denyReason.match(/Your blocked tool call is saved at (\S+)/);
  assert.ok(match, "deny reason should contain a saved-file path");
  return match![1];
}

export function writeTranscript(model: string): string {
  const dir = mkdtempSync(`${tmpdir()}/block-parent-edits-`);
  const path = `${dir}/transcript.jsonl`;
  const lines = [
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    JSON.stringify({ type: "assistant", message: { model } }),
  ];
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
}

export function runHook(input: object, env: Record<string, string | undefined> = process.env): string {
  const run = spawnSync("node", [`${import.meta.dirname}/block-parent-edits.ts`], {
    input: JSON.stringify({ settings: DEFAULT_SETTINGS, ...input }),
    encoding: "utf8",
    env,
  });
  return run.stdout.trim();
}
