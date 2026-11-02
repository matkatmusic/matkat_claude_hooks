import type { HookRow } from "./stranger_constants.ts";

// (row, hook, prompt, text the hook must produce, hook event or null for a tool error)
export const SESSION_ONE_ROWS: HookRow[] = [
  [4, "block-bash-edits", "Use the Bash tool to run: echo hello > hello.txt", "Use the Edit/Write tools to modify files", null],
  [5, "block-npm-test", "Use the Bash tool to run: npm test", "Test runners are blocked", null],
  [6, "plan-file-reminder", "Write a file plans/test-plan.md that says: step 1.", "Conform the plan you're editing to", "PostToolUse"],
  [7, "nudge-task-list", 'Reply with one sentence that has the words "starting on" in it, then stop.', "You are starting work on a task", "Stop"],
  [8, "unlisted-items", 'Reply with one line only: "next step: build the login page". Do not make any task.', "These items are not on the task list", "Stop"],
];
export const PONYTAIL_ROW: HookRow = [10, "ponytail-ultra-nudge", "hello", "Ponytail ultra has not been invoked yet", "UserPromptSubmit"];
export const CLARIFY_ROW: HookRow = [11, "clarify-ambiguous", "fix it", "AMBIGUITY GATE", "UserPromptSubmit"];
export const PARENT_ROW: HookRow = [15, "block-parent-edits", "Create a file note.txt that says hi.", "Parent session must not edit files", null];
export const TYPECHECK_SUBAGENT_ROW: HookRow = [54, "typecheck-on-stop", 'Start one subagent in the foreground. Tell it to use the Write tool to create sub-bad.ts with this one line: const y: number = "hello"; Wait for the subagent.', "error TS2322", "SubagentStop"];
export const DEBT_SUBAGENT_ROW: HookRow = [55, "debt-ratchet", "Start one subagent in the foreground. Tell it to use the Write tool to create sub-add.ts with a function called add that adds two numbers. Tell it to write no test file. Wait for the subagent.", "Style debt is", "SubagentStop"];
export const SESSION_TWO_ROWS: HookRow[] = [
  [12, "typecheck-on-stop", 'Use the Write tool to create bad.ts with this one line: const x: number = "hello";', "error TS2322", "Stop"],
  [13, "debt-ratchet", "Use the Write tool to create add.ts with a function called add that adds two numbers. No test file.", "Style debt is", "Stop"],
];
