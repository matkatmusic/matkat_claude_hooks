# check-task-list-id

## What it does

It runs when a session starts. It checks the variable `CLAUDE_CODE_TASK_LIST_ID`. If the variable is not set, it shows you a warning. The warning tells you how to set it.

## The problem it solves

Claude keeps a task list for each project. The task list needs a name. The name comes from `CLAUDE_CODE_TASK_LIST_ID`. Without a name, the task list does not last from one session to the next. You lose your tasks and you do not know why.

## Why it was made

A project can start without this variable and nobody notices. The hook makes the missing variable easy to see on the first screen.

## How it works

1. Claude starts a session and runs the hook.
2. The hook gives `process.env.CLAUDE_CODE_TASK_LIST_ID` to `checkTaskListId` in `shared/task-list-id.ts`.
3. If the value is empty or missing, the hook prints a JSON object with a `systemMessage`.
4. If the value is set, the hook prints nothing.

The hook has no paths and no tunable numbers. It needs no `.env` value.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add this entry to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "SessionStart", command: ["node", "/path/to/claude_hooks/check-task-list-id/check-task-list-id.ts"], enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run `node --test check-task-list-id/check-task-list-id.test.ts` from the `claude_hooks` folder.
