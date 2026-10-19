#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState, type SessionState } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";
// UserPromptSubmit and PostToolUse(Skill) hook: nudges the agent on every prompt until ponytail ultra is invoked.

const SKILL_NAMES = ["ponytail:ponytail", "ponytail"];
const COMMAND_NAMES = ["/ponytail:ponytail", "/ponytail"];

type NudgeState = SessionState & { ponytailTranscriptOffset?: number };

function isUltraArgs(args: unknown): boolean {
  if (typeof args !== "string")
    return false;
  return args.trim().toLowerCase() === "ultra";
}

export function isPonytailUltraSkillCall(toolName: string, toolInput: any): boolean {
  if (toolName !== "Skill")
    return false;
  const isPonytailSkill = SKILL_NAMES.includes(toolInput?.skill);
  if (!isPonytailSkill)
    return false;
  return isUltraArgs(toolInput?.args);
}

export function isPonytailUltraTypedPrompt(prompt: string): boolean {
  const trimmedPrompt = prompt.trim();
  const firstSpace = trimmedPrompt.search(/\s/);
  const hasArgs = firstSpace !== -1;
  if (!hasArgs)
    return false;
  const commandName = trimmedPrompt.slice(0, firstSpace);
  const isPonytailCommand = COMMAND_NAMES.includes(commandName);
  if (!isPonytailCommand)
    return false;
  return isUltraArgs(trimmedPrompt.slice(firstSpace));
}

export function isPonytailUltraInTranscript(transcript: string): boolean {
  for (const line of transcript.split("\n")) {
    if (!line)
      continue;
    for (const commandName of COMMAND_NAMES) {
      const isTypedPonytailCommand = line.includes(`<command-name>${commandName}</command-name>`);
      if (!isTypedPonytailCommand)
        continue;
      const argsMatch = line.match(/<command-args>([^<]*)<\/command-args>/);
      const hasArgs = argsMatch !== null;
      if (!hasArgs)
        continue;
      const isUltraCommand = isUltraArgs(argsMatch[1]);
      if (isUltraCommand)
        return true;
    }
    const mightBeSkillCall = line.includes('"name":"Skill"');
    if (!mightBeSkillCall)
      continue;
    const entry = JSON.parse(line);
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    let invoked = false;
    for (const block of blocks) {
      const isToolUse = block.type === "tool_use";
      if (!isToolUse)
        continue;
      const isUltraSkillCall = isPonytailUltraSkillCall(block.name, block.input);
      if (isUltraSkillCall)
        invoked = true;
    }
    if (invoked)
      return true;
  }
  return false;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const path = getSessionStatePath(input.transcript_path, getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
  const state: NudgeState = readSessionState(path);
  if (state.ponytailUltraInvoked)
    process.exit(0);

  const isPostToolUse = input.hook_event_name === "PostToolUse";
  if (isPostToolUse) {
    const isUltraSkillRun = isPonytailUltraSkillCall(input.tool_name, input.tool_input);
    if (isUltraSkillRun) {
      state.ponytailUltraInvoked = true;
      writeSessionState(path, state);
    }
    process.exit(0);
  }

  let isPonytailUltraInvoked = isPonytailUltraTypedPrompt(input.prompt ?? "");
  if (!isPonytailUltraInvoked) {
    const transcriptExists = existsSync(input.transcript_path);
    const transcriptBytes = transcriptExists ? readFileSync(input.transcript_path) : Buffer.alloc(0);
    const offset = state.ponytailTranscriptOffset ?? 0;
    const newBytes = transcriptBytes.subarray(offset);
    const lastNewline = newBytes.lastIndexOf(10);
    const completeBytes = newBytes.subarray(0, lastNewline + 1);
    isPonytailUltraInvoked = isPonytailUltraInTranscript(completeBytes.toString("utf8"));
    state.ponytailTranscriptOffset = offset + completeBytes.length;
  }
  if (isPonytailUltraInvoked)
    state.ponytailUltraInvoked = true;
  writeSessionState(path, state);
  if (!isPonytailUltraInvoked) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "Ponytail ultra has not been invoked yet this session. Invoke Skill(skill: \"ponytail:ponytail\", args: \"ultra\") before responding to the user's prompt.",
        },
      }),
    );
  }
}
