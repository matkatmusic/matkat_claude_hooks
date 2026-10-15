#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
// UserPromptSubmit hook: nudges the agent to invoke ponytail ultra, once per session, until it does.

const SKILL_NAME = "ponytail:ponytail";

export function ponytailUltraInvoked(transcript: string): boolean {
  for (const line of transcript.split("\n")) {
    if (!line)
      continue;
    const isTypedPonytailCommand = line.includes("<command-name>/ponytail:ponytail</command-name>");
    if (isTypedPonytailCommand) {
      const isUltraCommandArgs = /<command-args>[^<]*ultra/i.test(line);
      if (isUltraCommandArgs)
        return true;
    }
    const mightBeSkillCall = line.includes('"name":"Skill"');
    if (!mightBeSkillCall)
      continue;
    const entry = JSON.parse(line);
    const blocks = Array.isArray(entry.message?.content) ? entry.message.content : [];
    let invoked = false;
    for (const block of blocks) {
      const isSkillToolUse = block.type === "tool_use" && block.name === "Skill";
      if (!isSkillToolUse)
        continue;
      const isPonytailSkill = block.input?.skill === SKILL_NAME;
      if (!isPonytailSkill)
        continue;
      const isUltraArgs = /ultra/i.test(block.input?.args ?? "");
      if (isUltraArgs)
        invoked = true;
    }
    if (invoked)
      return true;
  }
  return false;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const path = getSessionStatePath(input.transcript_path);
  const state = readSessionState(path);
  if (state.ponytailUltraInvoked)
    process.exit(0);

  const transcriptExists = existsSync(input.transcript_path);
  const transcript = transcriptExists ? readFileSync(input.transcript_path, "utf8") : "";
  const isPonytailUltraInvoked = ponytailUltraInvoked(transcript);
  if (isPonytailUltraInvoked) {
    state.ponytailUltraInvoked = true;
    writeSessionState(path, state);
  }
  else {
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
