export type HookEntry = {
  event: string;
  matcher?: string;
  command: string[];
  timeout?: number;
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
];
