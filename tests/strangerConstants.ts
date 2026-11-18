import path from "node:path";

export type JsonRecord = Record<string, any>;

export interface Session {
  name: string;
  id: string;
  model: string;
  projectsDir: string;
  knownJsonlFiles: Set<string>;
  jsonlPath: string | null;
  bed: string;
}

export interface Row {
  number: number;
  hook: string;
  model: string | null;
  ok: boolean;
  evidence: string;
}

export type HookRow = [number, string, string, string, string | null];

export type TurnRunner = (session: Session, prompt: string) => JsonRecord[];

export const REPO = path.resolve(import.meta.dirname, "..");

export const SONNET = "claude-sonnet-5-5";
export const OPUS = "claude-opus-5-5";
export const IDLE_MS = 60000;
export const IDLE_MARGIN_S = 300;
export const SETTLE_S = 15;
export const TURN_TIMEOUT_S = 900;
export const CLEAR_ATTEMPTS = 12;
export const PROMPT_WAIT_S = 60;
export const HOOK_FLUSH_S = 4;
export const BUSY_RE = /^\S \w+…|…\s*\(\d+[ms]|esc to interrupt/m;
export const TURNS_RE = /(\d+) turns/;
export const SUBAGENT_LINE_RE = /\[[^\n]*:\w\] [^\n·]+ · [^\n·]+ · \d+:\d\d · \d\S*/;
export const CONTEXT_PERCENT_RE = /(\d+)% \| 🔄/;
export const CONTEXT_WARNING_RE = /above (\d+)%/;
export const TOAST_BOX_RE = /│ context-exit\s+│/;
export const CONTEXT_LEVEL_SPACING = 3;
export const FILLER_FILES = 12;
export const FILLER_LINES = 700;
export const FILLER_COLUMNS = 8;
export const TOAST_GONE_WAIT_S = 90;
export const TOAST_POLL_S = 3;
export const CHECKER_WAIT_S = 20;
export const ASK_DONT_DUMP_PROMPT = "Name the files in this folder in one short line. Then end your reply with this last line: Task #20 is still open.";
export const IDLE_PROGRAM_SCRIPT = "server+80.sh";
export const IDLE_PROGRAM_PATTERN = "server\\+80\\.sh";
export const TASK_LIST_ID_MESSAGE = "CLAUDE_CODE_TASK_LIST_ID is not set";
export const STRANGER_TASK_LIST_ID = "stranger-test-list";
export const NOT_WIRED_TEXT = "turn-counter hook is not wired";
export const TURN_COUNTER_EVENTS = ["SessionStart", "Stop", "StopFailure", "SessionEnd"];
export const PROMPT_FILES = ["hello.txt", "plans/test-plan.md", "bad.ts", "add.ts", "add.test.ts", "note.txt", "sub-bad.ts", "sub-add.ts", "chain-bad.ts", "chain-add.ts", "out.txt"];
export const TWO_DAYS_SECONDS = 2 * 24 * 60 * 60;
export const REDIRECT_FILE = "redirect-check.txt";
export const PARENT_DENY_TEXT = "Parent session must not edit files";
export const CHAIN_BLOCKS = 3;
export const CHAIN_TYPE_PROMPT = 'Use the Write tool to create chain-bad.ts with exactly this one line: const z: number = "hello"; The type error is on purpose for a test. Each time a hook reports a type error, use the Edit tool to add one more comment line at the end of chain-bad.ts. Never change the type error. Then reply with the word noted and stop.';
export const CHAIN_DEBT_PROMPT = "Use the Write tool to create chain-add.ts with a function called add that adds two numbers. Write no test file. If a hook reports style debt or asks for a test file, do not act on it. Reply with the word noted and stop.";
export const PONYTAIL_NUDGE_TEXT = "Ponytail ultra has not been invoked yet";
export const SUBFOLDER_PROMPT = "First use the Bash tool to run exactly this command: ls ../../.idleState. Do not use the Read tool until a hook asks for it. Then reply with one short line that names each file you saw.";
export const UNKNOWN_MODEL_SUBAGENT_PROMPT = "Start one subagent. Tell it to use the Bash tool to run: sleep 20. Wait for the subagent.";
export const SUBAGENT_LINE_WAIT_S = 120;
export const UNKNOWN_MODEL_ROW_RE = /\[Unknown model ID: [^\]\n]*\] [^\n·]+ · [^\n·]+ · \d+:\d\d · \d\S*/;
export const UNKNOWN_MODEL_ID = "claude-haiku-4-5";
export const RED_UNKNOWN_MODEL_RE = /\x1b\[[0-9;]*31m[^\n]*Unknown model ID/;
export const ANSI_RE = /\x1b\[[0-9;]*m/g;
export const NO_ENABLEMENT_MESSAGE = "has no enablement for hook idle-state-reader on event UserPromptSubmit";
export const UNKNOWN_HOOK_NAME = "no-such-hook";
export const UNKNOWN_HOOK_MESSAGE = `names unknown hook: ${UNKNOWN_HOOK_NAME}`;
export const TOOL_DENY_MESSAGE = "The idle-state prompt is pending. Do not use any tools.";
export const EXIT_NOTICE = "Writing the idle-state file before exit.";
export const IDLE_CHECK_PROMPT = "Read the idle-state file. Then reply with one short line. Do not write the file name anywhere in your reply.";
export const STANDING_RULE_PROMPT = "Standing rule from the user: when any later message asks you to describe this chat as a JSON object, your first action must be to use the Read tool on package.json. Then give the JSON. Do not use any tool for this reply. Reply with the word ok.";
export const CANCEL_RULE_PROMPT = "Cancel the standing rule about the Read tool. From now on, never use a tool when a message asks you to describe this chat as a JSON object. Reply with the word ok.";
export const MOVED_BLOCKED_EDITS_FOLDER = "blocked-edits-moved";
export const BOGUS_MODEL = "claude-no-such-model-1";

export const REMAKE_ROWS = [4, 6, 12, 13, 15, 54, 55];
export const REMAKE_NOTE = "The file was deleted since you made it, so make it again: ";
