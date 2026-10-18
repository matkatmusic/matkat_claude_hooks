#!/usr/bin/env node
// Claude Code subagent status line. Docs: code.claude.com/docs/en/statusline#subagent-status-lines
import { readFileSync } from "node:fs";
import { CYAN, RED, RESET, formatTokens, formatOrDash } from "./status.ts";
import { EFFORT_ABBREVIATION, formatModelName, formatShortModelName } from "./statusShared.ts";

type SubagentTask = {
  id: string;
  name?: string;
  description: string;
  startTime: number;
  model?: string;
  // effort?: keyof typeof EFFORT_ABBREVIATION | number; // not in stdin payload; read from transcript instead
  tokenCount: number;
};

function formatSubagentModel(id: string): string {
  return formatShortModelName(formatModelName(id));
}

function formatSubagentEffort(level: string): string {
  return EFFORT_ABBREVIATION[level as keyof typeof EFFORT_ABBREVIATION];
}

if (import.meta.main) {
  const input: { transcript_path: string; tasks: SubagentTask[] } = JSON.parse(readFileSync(0, "utf8"));
  const subagentsDir = `${input.transcript_path.replace(".jsonl", "")}/subagents`;
  for (const task of input.tasks) {
    let model: string;
    try {
      model = formatOrDash(task.model, formatSubagentModel);
    }
    catch (error) {
      model = `${RED}${(error as Error).message}${RESET}`;
    }
    const transcript = readFileSync(`${subagentsDir}/agent-${task.id}.jsonl`, "utf8");
    const effortStart = transcript.lastIndexOf('"effort":"');
    const effortIsRecorded = effortStart !== -1;
    const effortValueStart = effortStart + '"effort":"'.length;
    const effortValue = effortIsRecorded ? transcript.slice(effortValueStart, transcript.indexOf('"', effortValueStart)) : undefined;
    const effort = formatOrDash(effortValue, formatSubagentEffort);
    const agentType = JSON.parse(readFileSync(`${subagentsDir}/agent-${task.id}.meta.json`, "utf8")).agentType;
    const name = task.name ?? agentType;
    const secondsRunning = Math.floor((Date.now() - task.startTime) / 1000);
    const timeRunning = `${Math.floor(secondsRunning / 60)}:${String(secondsRunning % 60).padStart(2, "0")}`;
    const content = `${CYAN}[${model}:${effort}]${RESET} ${name} · ${task.description} · ${timeRunning} · ${formatTokens(task.tokenCount)}`;
    console.log(JSON.stringify({ id: task.id, content }));
  }
}
