#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getSetting } from "../shared/settings.ts";
// import { readEnvValue } from "../shared/env.ts";
import { isBashCommandBlocked } from "./bash-block-pattern.ts";
// PreToolUse: blocks file edits from the parent (claude-fable-* or claude-opus-5 and later) session. Subagents may edit.

const OPUS_MAJOR_VERSION = /^claude-opus-(\d{1,2})(?!\d)/;
const SAVED_EDIT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isBlockedParentModel(transcriptPath: string): boolean {
  const lines = readFileSync(transcriptPath, "utf8").split("\n");
  let model = "";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i])
      continue;
    const entry = JSON.parse(lines[i]);
    const isAssistantWithModel = entry.type === "assistant" && entry.message?.model;
    if (isAssistantWithModel)
      model = entry.message.model;
    const isModelAttachment = entry.type === "attachment" && entry.attachment?.type === "model" && entry.attachment.identity?.modelId;
    if (isModelAttachment)
      model = entry.attachment.identity.modelId;
  }
  if (!model)
    return true;
    // throw new Error(`block-parent-edits: no model found in transcript ${transcriptPath}: the transcript has no assistant message and no model attachment`);
  const isFable = model.startsWith("claude-fable");
  const opusMatch = model.match(OPUS_MAJOR_VERSION);
  const isOpusFiveOrLater = opusMatch !== null && Number(opusMatch[1]) >= 5;
  return isFable || isOpusFiveOrLater;
}

function removeOldSavedEdits(dir: string): void {
  const names = readdirSync(dir);
  for (let i = 0; i < names.length; i++) {
    const filePath = join(dir, names[i]);
    const isOld = Date.now() - statSync(filePath).mtimeMs > SAVED_EDIT_MAX_AGE_MS;
    if (isOld)
      unlinkSync(filePath);
  }
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isSubagent = typeof input.agent_id === "string" || typeof input.agent_type === "string";
  const subagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? "";
  const isFableSubagent = isSubagent && subagentModel.startsWith("claude-fable");
  const isBlockedModelParent = !isSubagent && isBlockedParentModel(input.transcript_path);
  const parentInPlanMode = input.permission_mode === "plan";
  const isBlockedParent = isBlockedModelParent && !parentInPlanMode;

  const denyRules: { blocked: boolean; reason: string }[] = [
    { blocked: isFableSubagent, reason: "Fable subagents must not edit files. Fable should never edit code.  Change the CLAUDE_CODE_SUBAGENT_MODEL in the global .claude/settings.json environment variable to something other than a Fable model." },
    { blocked: isBlockedParent, reason: "Parent session must not edit files. Delegate the edit to a subagent." },
  ];

  let denyReason = "";
  for (let i = 0; i < denyRules.length; i++) {
    if (denyRules[i].blocked) {
      denyReason = denyRules[i].reason;
      break;
    }
  }

  if (!denyReason)
    process.exit(0);

  const toolName = input.tool_name;
  let blocked = toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit";
  if (toolName === "Bash")
    blocked = isBashCommandBlocked(input.tool_input?.command ?? "");
  const isIdleStateFile = (toolName === "Write" || toolName === "Edit") && String(input.tool_input?.file_path ?? "").includes("/.idleState/");
  if (isIdleStateFile)
    blocked = false;

  if (blocked) {
    let finalDenyReason = denyReason;
    if (isBlockedParent) {
      const dir = getSetting(input, "CLAUDE_HOOKS_BLOCKED_EDITS_DIR");
      mkdirSync(dir, { recursive: true });
      removeOldSavedEdits(dir);
      const savedPath = join(dir, `${input.session_id}-${Date.now()}.json`);
      writeFileSync(savedPath, JSON.stringify(input.tool_input, null, 2));
      finalDenyReason = `${denyReason} Your blocked tool call is saved at ${savedPath} (JSON of the tool input). Tell the subagent to read that file and apply it. Do not repeat its content in the prompt. Keep the prompt short: file paths, the change, how to check it. No background.`;
    }
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: finalDenyReason,
        },
      }),
    );
  }
}
