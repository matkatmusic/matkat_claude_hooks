import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SUBAGENT_STATUS_PATH = join(import.meta.dirname, "subagentStatusLine.ts");
const RED = "\x1b[31m";

function runSubagentStatus(modelId: string, recordedEffort: string) {
  const dir = mkdtempSync(join(tmpdir(), "status-line-sub-"));
  const subagentsDir = join(dir, "t", "subagents");
  mkdirSync(subagentsDir, { recursive: true });
  writeFileSync(join(subagentsDir, "agent-a1.jsonl"), `{"effort":"${recordedEffort}"}`);
  writeFileSync(join(subagentsDir, "agent-a1.meta.json"), JSON.stringify({ agentType: "general" }));
  const task = { id: "a1", description: "work", startTime: Date.now(), model: modelId, tokenCount: 5 };
  const result = spawnSync("node", [SUBAGENT_STATUS_PATH], {
    input: JSON.stringify({ transcript_path: join(dir, "t.jsonl"), tasks: [task] }),
    env: process.env,
    encoding: "utf8",
  });
  assert.equal(result.status, 0);
  return JSON.parse(result.stdout.trim());
}

test("subagent row: shows the short model name, effort, and the task", () => {
  const row = runSubagentStatus("claude-opus-5-5", "high");
  assert.equal(row.id, "a1");
  assert.ok(row.content.includes("opus5.5:H"));
  assert.ok(row.content.includes("work"));
  assert.ok(!row.content.includes(RED));
});

test("subagent row: an unknown model ID shows the error text in red", () => {
  const row = runSubagentStatus("claude-nope-9", "high");
  assert.equal(row.id, "a1");
  assert.ok(row.content.includes("claude-nope-9"));
  assert.ok(row.content.includes(RED));
});
