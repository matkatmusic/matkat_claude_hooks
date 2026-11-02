import { rmSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { type HookRow, PROMPT_FILES, REMAKE_NOTE, REMAKE_ROWS, type Row, type Session, type TurnRunner, TURNS_RE } from "./stranger_constants.ts";
import { setEnablement } from "./stranger_dispatch.ts";
import { addRow, findEvidence } from "./stranger_evidence.ts";
import { getSessionModel } from "./stranger_turn.ts";

export function removePromptFiles(bed: string): void {
  for (const promptFile of PROMPT_FILES) {
    rmSync(path.join(bed, "project", promptFile), { force: true });
  }
}

function formatOffOnEvidence(offFound: string | undefined, onFound: string | undefined): string {
  return `hook off: message ${offFound === undefined ? "absent" : "PRESENT"}; hook on: message ${onFound !== undefined ? "present" : "ABSENT"}: ${onFound !== undefined ? onFound : ""}`;
}

// Same prompt twice: hook off must show no message, hook on must show it. Returns the added row.
export function executeOffOnPair(rows: Row[], session: Session, bed: string, hookRow: HookRow, runTurn: TurnRunner): Row {
  const [number, hook, prompt, needle, event] = hookRow;
  const clone = path.join(bed, "claude_hooks");
  const enablementEvent = event ?? "PreToolUse";
  setEnablement(clone, hook, enablementEvent, false);
  const offFound = findEvidence(runTurn(session, prompt), needle, event);
  removePromptFiles(bed);
  setEnablement(clone, hook, enablementEvent, true);
  const onPrompt = REMAKE_ROWS.includes(number) ? REMAKE_NOTE + prompt : prompt;
  const onFound = findEvidence(runTurn(session, onPrompt), needle, event);
  const switchOk = offFound === undefined && onFound !== undefined;
  addRow(rows, number, hook, getSessionModel(session), switchOk, formatOffOnEvidence(offFound, onFound));
  return rows[rows.length - 1]!;
}

export function getPaneTurns(name: string): number | null {
  const found = TURNS_RE.exec(tmux_lib.tmux_capturePane(name));
  if (found === null) {
    return null;
  }
  return Number(found[1]);
}
