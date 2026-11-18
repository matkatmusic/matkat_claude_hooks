import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { IDLE_MS } from "./strangerConstants.ts";

const USER_ENABLEMENTS: Record<string, Record<string, boolean>> = {
  "blockNpmTest": { PreToolUse: true },
  "blockParentEdits": { PreToolUse: true },
  "blockBashEdits": { PreToolUse: true },
  "planFileReminder": { PostToolUse: true },
  "checkTaskListId": { SessionStart: true },
  "nudgeTaskList": { Stop: true },
  "unlistedItems": { Stop: true },
  "turnCounter": { SessionStart: true, Stop: true, StopFailure: true, SessionEnd: true },
  "ponytailUltraNudge": { UserPromptSubmit: true },
  "clarifyAmbiguous": { UserPromptSubmit: true },
  "typecheckOnStop": { Stop: true, SubagentStop: true },
  "debtRatchet": { Stop: true, SubagentStop: true },
  "idleStateReader": { UserPromptSubmit: true },
  "idleStateCheck": { Stop: true },
  "ask-dont-dump": { "prompt.submit": true, "turn.complete": true, "session.end": true },
  "idle-state": { "session.start": true, "session.end": true, "prompt.submit": true, "turn.complete": true, "turn.start": true, "tool.call": true, "command.run": true },
  "context-exit": { "turn.complete": true },
};

function buildUserValues(bed: string, config: string): Record<string, Record<string, string>> {
  return {
    shared: { CLAUDE_HOOKS_SESSION_STATE_DIR: path.join(bed, "state") },
    "planFileReminder": { CLAUDE_HOOKS_PLANNING_GUIDE_PATH: path.join(bed, "planning.md") },
    "unlistedItems": { CLAUDE_HOOKS_TASKS_DIR: `${config}/tasks` },
    "blockParentEdits": { CLAUDE_HOOKS_BLOCKED_EDITS_DIR: path.join(bed, "blocked-edits") },
    "blockNpmTest": { CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR: path.join(bed, "npm-test-logs") },
    "debtRatchet": { CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: path.join(bed, "array-debt") },
    "idle-state": { CLAUDE_HOOKS_IDLE_MINUTES: String(IDLE_MS / 60000) },
    "context-exit": { CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS: "30,50,80" },
  };
}

export function writeUserDispatch(clone: string, bed: string, config: string): void {
  const values = buildUserValues(bed, config);
  const dispatch = { enablements: USER_ENABLEMENTS, values };
  writeFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), JSON.stringify(dispatch, null, 2) + "\n");
}

export function setEnablement(clone: string, hook: string, event: string, on: boolean): void {
  const userDispatchPath = path.join(clone, "dispatcher", "user-dispatch.json");
  const userDispatch = JSON.parse(readFileSync(userDispatchPath, "utf8"));
  userDispatch.enablements[hook][event] = on;
  writeFileSync(userDispatchPath, JSON.stringify(userDispatch, null, 2) + "\n");
}

export function setValue(clone: string, section: string, key: string, value: string): void {
  const userDispatchPath = path.join(clone, "dispatcher", "user-dispatch.json");
  const userDispatch = JSON.parse(readFileSync(userDispatchPath, "utf8"));
  userDispatch.values[section][key] = value;
  writeFileSync(userDispatchPath, JSON.stringify(userDispatch, null, 2) + "\n");
}

export function readDispatchTexts(clone: string): string[] {
  const defaultsText = readFileSync(path.join(clone, "dispatcher", "dispatch.json"), "utf8");
  const userText = readFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), "utf8");
  return [defaultsText, userText];
}

export function writeDispatchTexts(clone: string, texts: string[]): void {
  writeFileSync(path.join(clone, "dispatcher", "dispatch.json"), texts[0]!);
  writeFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), texts[1]!);
}

// Removes one hook event from both files, so the dispatcher finds no enablement for it.
export function removeEnablement(clone: string, hook: string, event: string): void {
  for (const fileName of ["dispatch.json", "user-dispatch.json"]) {
    const filePath = path.join(clone, "dispatcher", fileName);
    const settings = JSON.parse(readFileSync(filePath, "utf8"));
    delete settings.enablements[hook][event];
    writeFileSync(filePath, JSON.stringify(settings, null, 2) + "\n");
  }
}

export function addUnknownHook(clone: string, hook: string): void {
  const userDispatchPath = path.join(clone, "dispatcher", "user-dispatch.json");
  const userDispatch = JSON.parse(readFileSync(userDispatchPath, "utf8"));
  userDispatch.enablements[hook] = { Stop: true };
  writeFileSync(userDispatchPath, JSON.stringify(userDispatch, null, 2) + "\n");
}
