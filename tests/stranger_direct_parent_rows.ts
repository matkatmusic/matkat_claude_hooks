// Direct rows 21 to 24: block-parent-edits, check-task-list-id, clarify-ambiguous.
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type DirectContext, type DirectResult, buildResult, formatFlag, isHookDenied, readDenyReason, executeHook, writeJsonLines } from "./stranger_direct_support.ts";

const PARENT_SCRIPT = "block-parent-edits/block-parent-edits.ts";
const CLARIFY_SCRIPT = "clarify-ambiguous/clarify-ambiguous.ts";
const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;
const LONG_PREFIX_PROMPT = "Please add the new prefix to every column name in the report table and then explain how the final names look afterwards";

function writeModelTranscript(context: DirectContext, name: string, model: string | null): string {
  const file = path.join(context.direct, "transcripts", `${name}.jsonl`);
  const entries: object[] = [{ type: "user", message: { role: "user", content: "hi" } }];
  if (model !== null)
    entries.push({ type: "assistant", message: { role: "assistant", model, content: [{ type: "text", text: "ok" }] } });
  writeJsonLines(file, entries);
  return file;
}

function executeParentTool(context: DirectContext, transcript: string, toolName: string, toolInput: object) {
  const input = { hook_event_name: "PreToolUse", session_id: "direct-parent", cwd: context.direct, permission_mode: "default", transcript_path: transcript, tool_name: toolName, tool_input: toolInput };
  return executeHook(context, PARENT_SCRIPT, input, context.direct);
}

export function validateParentModels(context: DirectContext): DirectResult {
  const writeInput = { file_path: path.join(context.direct, "note.txt"), content: "hi" };
  const newOpus = executeParentTool(context, writeModelTranscript(context, "opus-6", "claude-opus-6-0"), "Write", writeInput);
  const sonnet = executeParentTool(context, writeModelTranscript(context, "sonnet", "claude-sonnet-5-5"), "Write", writeInput);
  const noModel = executeParentTool(context, writeModelTranscript(context, "no-model", null), "Write", writeInput);
  const blocksNewOpus = isHookDenied(newOpus) && readDenyReason(newOpus).includes("Parent session must not edit files");
  const allowsSonnet = !isHookDenied(sonnet);
  const failsLoudly = noModel.status !== 0 && noModel.stderr.includes("no model found");
  const ok = blocksNewOpus && allowsSonnet && failsLoudly;
  return buildResult(21, "block-parent-edits (model)", ok, `claude-opus-6 blocked: ${formatFlag(blocksNewOpus)}; sonnet allowed: ${formatFlag(allowsSonnet)}; no model fails loudly: ${formatFlag(failsLoudly)}`);
}

export function validateParentIdleStateAndCleanup(context: DirectContext): DirectResult {
  const transcript = writeModelTranscript(context, "opus-idle", "claude-opus-6-0");
  const editsDir = path.join(context.direct, "blocked-edits");
  mkdirSync(editsDir, { recursive: true });
  const oldSavedEdit = path.join(editsDir, "old-session-1.json");
  writeFileSync(oldSavedEdit, "{}");
  const twoDaysAgo = Date.now() / 1000 - TWO_DAYS_SECONDS;
  utimesSync(oldSavedEdit, twoDaysAgo, twoDaysAgo);
  const idleStateWrite = executeParentTool(context, transcript, "Bash", { command: `echo hi > ${context.direct}/.idleState/x.json` });
  const otherWrite = executeParentTool(context, transcript, "Bash", { command: `echo hi > ${context.direct}/out.txt` });
  const allowsIdleState = !isHookDenied(idleStateWrite);
  const deniesOther = isHookDenied(otherWrite);
  const removedOldEdit = !existsSync(oldSavedEdit);
  const ok = allowsIdleState && deniesOther && removedOldEdit;
  return buildResult(22, "block-parent-edits (files)", ok, `redirect into .idleState allowed: ${formatFlag(allowsIdleState)}; other redirect denied: ${formatFlag(deniesOther)}; 2 day old saved edit removed: ${formatFlag(removedOldEdit)}`);
}

export function validateTaskListIdName(context: DirectContext): DirectResult {
  const tooShort = executeHook(context, "check-task-list-id/check-task-list-id.ts", "", context.direct, { CLAUDE_CODE_TASK_LIST_ID: "x" });
  const badCharacter = executeHook(context, "check-task-list-id/check-task-list-id.ts", "", context.direct, { CLAUDE_CODE_TASK_LIST_ID: "my project!" });
  const goodName = executeHook(context, "check-task-list-id/check-task-list-id.ts", "", context.direct, { CLAUDE_CODE_TASK_LIST_ID: "myproject" });
  const warnsShort = tooShort.stdout.includes("too short");
  const warnsCharacter = badCharacter.stdout.includes("not allowed");
  const staysQuiet = goodName.stdout.trim() === "";
  const ok = warnsShort && warnsCharacter && staysQuiet;
  return buildResult(23, "check-task-list-id (name)", ok, `"x" warned too short: ${formatFlag(warnsShort)}; "my project!" warned bad character: ${formatFlag(warnsCharacter)}; "myproject" silent: ${formatFlag(staysQuiet)}`);
}

function executeClarify(context: DirectContext, name: string, prompt: string) {
  const transcript = path.join(context.direct, "transcripts", `${name}.jsonl`);
  return executeHook(context, CLARIFY_SCRIPT, { hook_event_name: "UserPromptSubmit", session_id: name, transcript_path: transcript, prompt }, context.direct);
}

export function validateClarifyWords(context: DirectContext): DirectResult {
  const prefixRun = executeClarify(context, "clarify-prefix", LONG_PREFIX_PROMPT);
  const yesRun = executeClarify(context, "clarify-yes", "yes");
  const brokenRun = executeHook(context, CLARIFY_SCRIPT, "not json", context.direct);
  const ignoresPrefix = !prefixRun.stdout.includes("AMBIGUITY GATE");
  const ignoresYes = !yesRun.stdout.includes("AMBIGUITY GATE");
  const failsLoudly = brokenRun.status !== 0;
  const ok = ignoresPrefix && ignoresYes && failsLoudly;
  return buildResult(24, "clarify-ambiguous (words)", ok, `"prefix" no longer counts as "fix": ${formatFlag(ignoresPrefix)}; bare "yes" has no gate: ${formatFlag(ignoresYes)}; bad input fails loudly: ${formatFlag(failsLoudly)}`);
}
