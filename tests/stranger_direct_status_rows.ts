// Direct rows 29 to 31: status-line and subagentStatusLine, run on the bed clone with crafted input.
import { readFileSync } from "node:fs";
import path from "node:path";
import { type DirectContext, type DirectResult, buildResult, formatFlag, executeHook, writeFiles } from "./stranger_direct_support.ts";

const STATUS_SCRIPT = "status-line/status.ts";
const SUBAGENT_SCRIPT = "status-line/subagentStatusLine.ts";

function executeStatus(context: DirectContext, sessionId: string, displayName: string) {
  const input = { session_id: sessionId, model: { id: "x", display_name: displayName }, workspace: { current_dir: context.direct } };
  return executeHook(context, STATUS_SCRIPT, input, context.direct);
}

export function validateStatusTurnCounterNotWired(context: DirectContext): DirectResult {
  const run = executeStatus(context, "direct-status-unwired", "Opus 5");
  const countersLine = run.stdout.split("\n")[1];
  const namesProblem = countersLine.includes("turn-counter hook is not wired");
  const hidesTokens = !countersLine.includes("Tokens In:");
  const ok = run.status === 0 && namesProblem && hidesTokens;
  return buildResult(29, "status-line (no counter)", ok, `exit ${run.status}; line 2 names the missing turn-counter hook: ${formatFlag(namesProblem)}; no fake "0 turns" or token numbers: ${formatFlag(hidesTokens)}`);
}

export function validateStatusUnknownModel(context: DirectContext): DirectResult {
  const run = executeStatus(context, "direct-status-model", "Nova 9");
  const lines = run.stdout.split("\n");
  const namesModel = lines[0].includes("Nova 9");
  const hasRed = lines[0].includes("\x1b[31m");
  const keepsOtherLines = lines.length > 2;
  const ok = run.status === 0 && namesModel && hasRed && keepsOtherLines;
  return buildResult(30, "status-line (model)", ok, `exit ${run.status}; line 1 shows "Nova 9" in red: ${formatFlag(namesModel && hasRed)}; the other lines still print: ${formatFlag(keepsOtherLines)}`);
}

function readRefreshInterval(file: string, key: string): number {
  return JSON.parse(readFileSync(file, "utf8"))[key].refreshInterval;
}

export function validateSubagentStatusLine(context: DirectContext): DirectResult {
  const dir = path.join(context.direct, "subagent-status");
  const subagentsDir = path.join(dir, "t", "subagents");
  writeFiles(subagentsDir, { "agent-a1.jsonl": '{"effort":"high"}', "agent-a1.meta.json": JSON.stringify({ agentType: "general" }) });
  const task = { id: "a1", description: "work", startTime: Date.now(), model: "claude-nope-9", tokenCount: 5 };
  const run = executeHook(context, SUBAGENT_SCRIPT, { transcript_path: path.join(dir, "t.jsonl"), tasks: [task] }, dir);
  const row = JSON.parse(run.stdout.trim());
  const namesModel = row.content.includes("claude-nope-9") && row.content.includes("\x1b[31m");
  const settingsPath = path.join(context.config, "settings.json");
  const bedStatus = readRefreshInterval(settingsPath, "statusLine");
  const bedSubagent = readRefreshInterval(settingsPath, "subagentStatusLine");
  const cloneSubagent = readRefreshInterval(path.join(context.clone, "status-line", "hooks.json"), "subagentStatusLine");
  const refreshes = bedStatus === 3 && bedSubagent === 3 && cloneSubagent === 3;
  const ok = row.id === "a1" && namesModel && refreshes;
  return buildResult(31, "status-line (subagent)", ok, `unknown model id shown in red, row still printed: ${formatFlag(namesModel)}; refreshInterval bed statusLine=${bedStatus} subagentStatusLine=${bedSubagent}, clone subagent=${cloneSubagent}`);
}
