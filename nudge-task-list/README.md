# nudge-task-list

## What it does

It runs when Claude stops its reply. It reads the last reply. If the reply says that work is starting, the hook blocks the stop. It tells Claude to make a task list and to use subagents for the build.

## The problem it solves

Claude can start a big job and forget to track it. Then the steps get lost. Work on the same files can also clash when many parts run at once.

## Why it was made

A task list keeps a long job in order. Subagents in their own worktrees keep parallel work apart. The hook reminds Claude to do both, at the moment work begins.

## How it works

1. Claude stops its reply and runs the hook.
2. The hook looks for phrases such as "things to do", "starting on", "starting with", and "fanning out".
3. If it finds no phrase, the hook prints nothing.
4. If it finds a phrase, the hook prints a JSON object with `decision: "block"` and a `reason`. The reason is the nudge text.
5. If `CLAUDE_CODE_TASK_LIST_ID` is not set, the hook calls `checkTaskListId` from `shared/task-list-id.ts`. It adds the setup help to the reason.

## The .env value

The hook needs no `.env` value.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.
## Turn it on through the dispatcher

Add this entry to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "Stop", command: ["node", "/path/to/claude_hooks/nudge-task-list/nudge-task-list.ts"], enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run `node --test nudge-task-list/nudge-task-list.test.ts` from the `claude_hooks` folder.
