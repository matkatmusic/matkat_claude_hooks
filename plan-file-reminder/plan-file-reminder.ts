#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { readEnvValue } from "../shared/env.ts";
// PostToolUse on Write|Edit: reminds the agent to follow the planning guide after it touches a plan file.

export function buildReminder(): string {
  return `Conform the plan you're editing to ${readEnvValue("CLAUDE_HOOKS_PLANNING_GUIDE_PATH")}.`;
}

export function isPlanEdit(input: {
  permission_mode?: string;
  tool_input?: { file_path?: string };
}): boolean {
  if (input.permission_mode === "plan")
    return true;
  return (input.tool_input?.file_path ?? "").includes("/plans/");
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (!isPlanEdit(input))
    process.exit(0);
  console.log(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: buildReminder() },
    }),
  );
}
