export type HookEntry = {
  event: string;
  matcher?: string;
  command: string[];
  timeout?: number;
  env?: Record<string, string>;
  enabled: boolean;
};

/*
  EXAMPLE LIST. Copy an entry, point command at your script, set enabled to true.
*/
export const HOOKS: HookEntry[] = [
  // runs before a Bash tool call; exit 2 or a deny decision blocks the call
  { event: "PreToolUse", matcher: "Bash", command: ["node", "/path/to/your-pre-bash-hook.ts"], timeout: 60, enabled: false },
  // runs after a file is written or edited
  { event: "PostToolUse", matcher: "Write|Edit", command: ["node", "/path/to/your-post-edit-hook.ts"], enabled: false },
  // text on stdout becomes extra context for the model
  { event: "SessionStart", command: ["node", "/path/to/your-session-start-hook.ts"], enabled: false },
  // a block decision keeps the agent working
  { event: "Stop", command: ["node", "/path/to/your-stop-hook.ts"], enabled: false },
  // blocks raw 'npm test' and runs a specific test command that reduces test output
  { event: "PreToolUse", matcher: "Bash", command: ["node", `${import.meta.dirname}/../block-npm-test/block-npm-test.ts`], timeout: 300, enabled: false },
  // blocks file edits from the parent session; subagents may edit
  { event: "PreToolUse", matcher: "Edit|Write|NotebookEdit|Bash", command: ["node", `${import.meta.dirname}/../block-parent-edits/block-parent-edits.ts`], enabled: false },
  // blocks Bash commands that write file content; use Edit/Write instead
  { event: "PreToolUse", matcher: "Bash", command: ["node", `${import.meta.dirname}/../block-bash-edits/block-bash-edits.ts`], enabled: false },
  // after a plan file is edited, reminds the agent to follow the planning guide
  { event: "PostToolUse", matcher: "Write|Edit", command: ["node", `${import.meta.dirname}/../plan-file-reminder/plan-file-reminder.ts`], enabled: false },
  // warns when the project has no CLAUDE_CODE_TASK_LIST_ID
  { event: "SessionStart", command: ["node", `${import.meta.dirname}/../check-task-list-id/check-task-list-id.ts`], enabled: false },
  // when the reply says work is starting, blocks until the agent uses the task list
  { event: "Stop", command: ["node", `${import.meta.dirname}/../nudge-task-list/nudge-task-list.ts`], enabled: false },
  // blocks when the reply names work still to build that is not on the task list
  { event: "Stop", command: ["node", `${import.meta.dirname}/../unlisted-items/unlisted-items.ts`], enabled: false },
  // counts turns per conversation into the session state file's sittings list
  { event: "SessionStart", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: false },
  { event: "Stop", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: false },
  { event: "StopFailure", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: false },
  { event: "SessionEnd", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: false },
  // until ponytail ultra has been invoked this session, tells the agent to invoke it before replying
  { event: "UserPromptSubmit", command: ["node", `${import.meta.dirname}/../ponytail-ultra-nudge/ponytail-ultra-nudge.ts`], enabled: false },
  // flags ambiguous prompts and asks for one clarifying question; add "jdi" to opt out
  { event: "UserPromptSubmit", command: ["node", `${import.meta.dirname}/../clarify-ambiguous/clarify-ambiguous.ts`], enabled: false },
  // blocks the stop while tsc reports type errors, when a .ts file was edited this turn
  { event: "Stop", command: ["node", `${import.meta.dirname}/../typecheck-on-stop/typecheck-on-stop.ts`], timeout: 300, enabled: false },
  { event: "SubagentStop", command: ["node", `${import.meta.dirname}/../typecheck-on-stop/typecheck-on-stop.ts`], timeout: 300, enabled: false },
  // runs eslint --fix on edited .ts files and blocks unless the style-debt total dropped this turn
  { event: "Stop", command: ["node", `${import.meta.dirname}/../debt-ratchet/debt-ratchet.ts`], timeout: 300, enabled: false },
  { event: "SubagentStop", command: ["node", `${import.meta.dirname}/../debt-ratchet/debt-ratchet.ts`], timeout: 300, enabled: false },
  // first prompt only: hands the model the recent .idleState files; skips when the prompt runs catch-up
  { event: "UserPromptSubmit", command: ["node", `${import.meta.dirname}/../idle-state/idle-state-reader.ts`], enabled: false },
  // on the first turn, blocks until the model reads and names each idle-state file
  { event: "Stop", command: ["node", `${import.meta.dirname}/../idle-state/idle-state-check.ts`], enabled: false },
];
