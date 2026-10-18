#!/usr/bin/env node
// / <reference path="./hooks-globals.d.ts" /> UserPromptSubmit gate: flags ambiguous prompts. Tune knobs below; add "jdi" to opt out.
import { readFileSync } from "node:fs";
import { readEnvValue } from "../shared/env.ts";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";

const MAX_WORDS = Number(readEnvValue("CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS"));
const VAGUE =
  /\b(fix|improve|clean ?up|make (it|this) better|optimi[sz]e|refactor|tidy|polish|streamline|sort out|deal with|rework|redo|handle)\b/;
const OPT_OUT = /\bjdi\b|just do it|no questions/;
const SPECIFIC = /\/[A-Za-z0-9._-]+|[A-Za-z0-9_-]+\.[A-Za-z]{1,4}\b|`/;
const APPROVAL =
  /^(yes|yep|yeah|sure|ok(ay)?|do it|do both|both|go ahead|proceed|sounds good|ship it|lgtm)\b/;
// const MARKER_DIR = `${process.env.HOME}/.claude/tmp/ambiguity-gate`;

export const GATE = `[AMBIGUITY GATE — this prompt matched the ambiguity heuristic]

Before your first Edit, Write, or state-changing Bash call this turn: if two
competent engineers could reasonably implement this request differently, stop
and present exactly two labeled options via AskUserQuestion, each with a
one-line consequence, recommended option first.

For this turn only, this overrides:
  - "Interpret ambiguity the way a careful colleague would: make routine
    judgment calls yourself" (Delivering work)
  - "When you have enough information to act, act"
  - "Never stall on an answer you can default" (ponytail)
  - AskUserQuestion's "use this tool only when you are blocked" gate

Read, grep, and explore first — judge ambiguity AFTER seeing the code, not
from the prompt text alone. If exploration resolves it, proceed silently.
Never mention this gate in your reply.`;

export function isAmbiguous(prompt: string): boolean {
  const trimmed = prompt.trim();
  if (!trimmed)
    return false;

  // Slash commands and ! passthroughs are already explicit.
  if (trimmed.startsWith("/") || trimmed.startsWith("!"))
    return false;

  const lower = trimmed.toLowerCase();
  if (OPT_OUT.test(lower))
    return false;

  if (lower === "yes")
    return false;

  // Approving work is where unstated implementation choices get made.
  if (APPROVAL.test(lower))
    return true;

  const vague = VAGUE.test(lower);
  const words = trimmed.split(/\s+/).length;

  // Other short replies answer a question ("option A") — stay silent.
  if (words <= 3 && !vague)
    return false;

  return vague || (words <= MAX_WORDS && !SPECIFIC.test(trimmed));
}

type Marker = { count: number; lastFired: number };

// async function readMarker(path: string): Promise<Marker> {
//   try {
//     return JSON.parse(await Bun.file(path).text());
//   }
//   catch {
//     return { count: 0, lastFired: -1 };
//   }
// }

if (import.meta.main) {
  // const raw = await Bun.stdin.text();
  const raw = readFileSync(0, "utf8");
  const input: { prompt?: string; session_id?: string; transcript_path?: string } = JSON.parse(raw);
  // let input: { prompt?: string; session_id?: string; transcript_path?: string } = {};
  // try {
  //   input = JSON.parse(raw);
  // }
  // catch {
  //   process.exit(0);
  // }

  // const path = `${MARKER_DIR}/${input.session_id ?? "unknown"}.json`;
  const path = getSessionStatePath(input.transcript_path ?? input.session_id ?? "unknown");
  const state = readSessionState(path);
  const marker: Marker = state.ambiguity ?? { count: 0, lastFired: -1 };
  marker.count += 1;

  // Never fire twice running — the second prompt is your answer to the first.
  const suppressed = marker.lastFired === marker.count - 1;
  const fire = isAmbiguous(input.prompt ?? "") && !suppressed;
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
