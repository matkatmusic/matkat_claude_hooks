#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { readEnvValue } from "../shared/env.ts";
// PostToolUse on Write|Edit|MultiEdit|NotebookEdit: reminds the agent to follow the planning guide after it touches a plan file.

function convertHomePath(path: string): string {
  const startsWithHome = path.startsWith("~/");
  if (path === "~")
    return homedir();
  if (startsWithHome)
    return join(homedir(), path.slice(2));
  return path;
}

export function buildReminder(): string {
  return `Conform the plan you're editing to ${convertHomePath(readEnvValue("CLAUDE_HOOKS_PLANNING_GUIDE_PATH"))}.`;
}

export function isPlanEdit(input: {
  permission_mode?: string;
  cwd?: string;
  tool_input?: { file_path?: string; notebook_path?: string };
}): boolean {
  const editedPath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (editedPath === undefined)
    return false;
  const projectRoot = input.cwd ?? process.cwd();
  const plansFolder = resolve(projectRoot, "plans");
  return resolve(projectRoot, editedPath).startsWith(plansFolder + sep);
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isPlan = isPlanEdit(input);
  if (!isPlan)
    process.exit(0);
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: buildReminder() },
    }),
  );
}
