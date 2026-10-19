#!/usr/bin/env node
// UserPromptSubmit gate: flags ambiguous prompts. Tune knobs below; add "jdi" to opt out.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";
const VAGUE =
  /\b(fix|improve|clean ?up|make (it|this) better|optimi[sz]e|refactor|tidy|polish|streamline|sort out|deal with|rework|redo|handle)\b/;
const OPT_OUT = /\bjdi\b|just do it|no questions/;
const APPROVAL =
  /^(yes|yep|yeah|sure|ok(ay)?|do it|do both|both|go ahead|proceed|sounds good|ship it|lgtm)\b/;

// old GATE paragraph: explore the code first; judge ambiguity after reading it; proceed silently if resolved.
export const GATE = `[AMBIGUITY GATE — this prompt matched the ambiguity heuristic]

Before any tool call, restate in 1 to 3 bullets what you think I am asking for.
Then confirm with AskUserQuestion. Do not start work until I answer.

For this turn only, this overrides:
  - "Interpret ambiguity the way a careful colleague would: make routine
    judgment calls yourself" (Delivering work)
  - "When you have enough information to act, act"
  - "Never stall on an answer you can default" (ponytail)
  - AskUserQuestion's "use this tool only when you are blocked" gate

Never mention this gate in your reply.`;

export function isAmbiguous(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed)
    return false;

  // Slash commands and ! passthroughs are already explicit.
  const startsWithSlash = trimmed.startsWith("/");
  const startsWithBang = trimmed.startsWith("!");
  const isTaskNotification = trimmed.startsWith("<task-notification>");
  const isAgentMessage = trimmed.startsWith("Another Claude session sent a message:");
  const isPassthrough = startsWithSlash || startsWithBang || isTaskNotification || isAgentMessage;
  if (isPassthrough)
    return false;

  const lower = trimmed.toLowerCase();
  const isOptOut = OPT_OUT.test(lower);
  if (isOptOut)
    return false;

  if (lower === "yes")
    return false;

  // Approving work is where unstated implementation choices get made.
  const isApproval = APPROVAL.test(lower);
  if (isApproval)
    return true;

  const vague = VAGUE.test(lower);
  const words = trimmed.split(/\s+/).length;

  // Other short replies answer a question ("option A") — stay silent.
  const isShortAndClear = words <= 3 && !vague;
  if (isShortAndClear)
    return false;

  return true;
}

const JUDGE_PROMPT =
  "You judge one prompt a user typed to a coding assistant. Answer CLEAR if it says exactly what the user wants done or answered, so two careful engineers would do the same thing. Otherwise answer UNCLEAR. Answer with one word only. The prompt:\n\n";

export function isClearVerdict(output: string): boolean {
  const verdict = output.trim();
  return verdict === "CLEAR";
}

// disableAllHooks stops the child claude from running this hook again.
function fetchHaikuIsClear(prompt: string): boolean {
  const judgeInput = JUDGE_PROMPT + prompt;
  const args = ["-p", "--model", "haiku", "--settings", '{"disableAllHooks":true}', "--strict-mcp-config", judgeInput];
  const stdout = execFileSync("claude", args, { encoding: "utf8" });
  return isClearVerdict(stdout);
}

type Marker = { count: number; lastFired: number };

if (import.meta.main) {
  const raw = readFileSync(0, "utf8");
  const input: { prompt?: string; session_id?: string; transcript_path?: string; settings?: Record<string, string> } = JSON.parse(raw);

  const path = getSessionStatePath(input.transcript_path ?? input.session_id ?? "unknown", getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR"));
  const state = readSessionState(path);
  const marker: Marker = state.ambiguity ?? { count: 0, lastFired: -1 };
  marker.count += 1;

  // Never fire twice running — the second prompt is your answer to the first.
  const suppressed = marker.lastFired === marker.count - 1;
  const prompt = input.prompt ?? "";
  const looksAmbiguous = isAmbiguous(prompt);
  const cheapChecksFire = looksAmbiguous && !suppressed;
  let fire = false;
  if (cheapChecksFire) {
    const haikuSaysClear = fetchHaikuIsClear(prompt);
    fire = !haikuSaysClear;
  }
  if (fire)
    marker.lastFired = marker.count;
  state.ambiguity = marker;
  writeSessionState(path, state);

  if (fire) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: GATE,
        },
      }),
    );
  }
}
