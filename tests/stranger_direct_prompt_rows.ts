// Direct rows 25, 26 and 28: nudge-task-list, plan-file-reminder, ponytail-ultra-nudge (PostToolUse only). Row 27 is now live row 62.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { type DirectContext, type DirectResult, buildResult, formatFlag, isHookBlocked, executeHook } from "./stranger_direct_support.ts";

const NUDGE_SCRIPT = "nudge-task-list/nudge-task-list.ts";
const PLAN_SCRIPT = "plan-file-reminder/plan-file-reminder.ts";
const PONYTAIL_SCRIPT = "ponytail-ultra-nudge/ponytail-ultra-nudge.ts";
const TASK_LIST_ENV = { CLAUDE_CODE_TASK_LIST_ID: "myproject" };
const REMINDER_TEXT = "Conform the plan you're editing to";
const NUDGE_TEXT = "Ponytail ultra has not been invoked yet";

function executeNudge(context: DirectContext, message: string, isActive: boolean) {
  const input = { hook_event_name: "Stop", session_id: "direct-nudge", stop_hook_active: isActive, last_assistant_message: message };
  return executeHook(context, NUDGE_SCRIPT, input, context.direct, TASK_LIST_ENV);
}

export function validateNudgeQuotedWords(context: DirectContext): DirectResult {
  const quoted = executeNudge(context, 'The phrase "starting with" is a trigger word.', false);
  const inWord = executeNudge(context, "Restarting once the cache clears.", false);
  const repeated = executeNudge(context, "I am starting on the build now.", true);
  const real = executeNudge(context, "I am starting on the build now.", false);
  const ignoresQuote = !isHookBlocked(quoted);
  const ignoresInWord = !isHookBlocked(inWord);
  const ignoresRepeat = !isHookBlocked(repeated);
  const stillBlocks = isHookBlocked(real);
  const ok = ignoresQuote && ignoresInWord && ignoresRepeat && stillBlocks;
  return buildResult(25, "nudge-task-list (words)", ok, `quoted phrase passes: ${formatFlag(ignoresQuote)}; "Restarting" passes: ${formatFlag(ignoresInWord)}; stop_hook_active passes: ${formatFlag(ignoresRepeat)}; real "starting on" blocks: ${formatFlag(stillBlocks)}`);
}

function executePlanEdit(context: DirectContext, project: string, extra: object) {
  return executeHook(context, PLAN_SCRIPT, { hook_event_name: "PostToolUse", cwd: project, ...extra }, project);
}

export function validatePlanFileReminder(context: DirectContext): DirectResult {
  const project = path.join(context.direct, "plan-project");
  mkdirSync(project, { recursive: true });
  const planModeOtherFile = executePlanEdit(context, project, { permission_mode: "plan", tool_name: "Write", tool_input: { file_path: path.join(project, "notes.txt") } });
  const relativePlan = executePlanEdit(context, project, { permission_mode: "default", tool_name: "Write", tool_input: { file_path: "plans/brief-3.md" } });
  const foreignPlans = executePlanEdit(context, project, { permission_mode: "default", tool_name: "Write", tool_input: { file_path: "/somewhere/else/plans/x.md" } });
  const notebookPlan = executePlanEdit(context, project, { permission_mode: "default", tool_name: "NotebookEdit", tool_input: { notebook_path: path.join(project, "plans", "nb.ipynb") } });
  const ignoresPlanMode = planModeOtherFile.stdout.trim() === "";
  const matchesRelative = relativePlan.stdout.includes(REMINDER_TEXT);
  const ignoresForeign = foreignPlans.stdout.trim() === "";
  const matchesNotebook = notebookPlan.stdout.includes(REMINDER_TEXT);
  const ok = ignoresPlanMode && matchesRelative && ignoresForeign && matchesNotebook;
  return buildResult(26, "plan-file-reminder", ok, `plan mode on a non-plan file: silent ${formatFlag(ignoresPlanMode)}; plans/brief-3.md reminds: ${formatFlag(matchesRelative)}; plans folder outside the project: silent ${formatFlag(ignoresForeign)}; notebook_path in plans reminds: ${formatFlag(matchesNotebook)}`);
}

function readUltraFlag(context: DirectContext, name: string): boolean {
  const statePath = path.join(context.direct, "state", `${name}.json`);
  const hasState = existsSync(statePath);
  if (!hasState)
    return false;
  return JSON.parse(readFileSync(statePath, "utf8")).ponytailUltraInvoked === true;
}

function executePonytail(context: DirectContext, name: string, event: string, extra: object) {
  const transcript = path.join(context.direct, "transcripts", `${name}.jsonl`);
  return executeHook(context, PONYTAIL_SCRIPT, { hook_event_name: event, session_id: name, transcript_path: transcript, ...extra }, context.direct);
}

// Moved to live row 62 in run_stranger.ts.
// export function validatePonytailTypedPrompt(context: DirectContext): DirectResult {
//   const fullName = executePonytail(context, "pt-full", "UserPromptSubmit", { prompt: "/ponytail:ponytail ultra" });
//   const shortName = executePonytail(context, "pt-short", "UserPromptSubmit", { prompt: "/ponytail ultra" });
//   const notUltra = executePonytail(context, "pt-not", "UserPromptSubmit", { prompt: "/ponytail:ponytail not ultra" });
//   const fullFlips = !fullName.stdout.includes(NUDGE_TEXT) && readUltraFlag(context, "pt-full");
//   const shortFlips = !shortName.stdout.includes(NUDGE_TEXT) && readUltraFlag(context, "pt-short");
//   const notUltraNudges = notUltra.stdout.includes(NUDGE_TEXT) && !readUltraFlag(context, "pt-not");
//   const ok = fullFlips && shortFlips && notUltraNudges;
//   return buildResult(27, "ponytail-ultra-nudge (typed)", ok, `/ponytail:ponytail ultra counts on the same prompt: ${formatFlag(fullFlips)}; /ponytail ultra counts: ${formatFlag(shortFlips)}; "not ultra" still nudges: ${formatFlag(notUltraNudges)}`);
// }
//
// Kept direct: hooks.json wires ponytail-ultra-nudge only to UserPromptSubmit, so a real session never sends the PostToolUse(Skill) call.
export function validatePonytailSkillCall(context: DirectContext): DirectResult {
  const skillInput = { tool_name: "Skill", tool_input: { skill: "ponytail:ponytail", args: "ultra" } };
  executePonytail(context, "pt-skill", "PostToolUse", skillInput);
  const nextPrompt = executePonytail(context, "pt-skill", "UserPromptSubmit", { prompt: "hello" });
  const flagSet = readUltraFlag(context, "pt-skill");
  const quietAfter = !nextPrompt.stdout.includes(NUDGE_TEXT);
  const ok = flagSet && quietAfter;
  return buildResult(28, "ponytail-ultra-nudge (skill)", ok, `Skill call with ultra sets the flag: ${formatFlag(flagSet)}; next prompt gets no nudge: ${formatFlag(quietAfter)}`);
}
