# check-task-list-id

It warns you at session start when the variable `CLAUDE_CODE_TASK_LIST_ID` is not set.

A project can start without this variable and nobody notices, so the hook makes the missing variable easy to see on the first screen.

## Install

Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "SessionStart", command: ["node", `${import.meta.dirname}/../check-task-list-id/check-task-list-id.ts`], enabled: true },
```

## How it works

The hook runs when a session starts. It gives `process.env.CLAUDE_CODE_TASK_LIST_ID` to `checkTaskListId` in `shared/task-list-id.ts`. If the value is empty or missing, the hook prints a warning that tells you how to set it. If the value is set but is not a good folder name, the hook prints a warning too. A good value has 3 or more characters, uses only letters, digits, `-`, `_` and `.`, and does not start with `.`. If the value is good, the hook prints nothing.

## More details

### The problem it solves

Claude keeps a task list for each project. The task list needs a name. The name comes from `CLAUDE_CODE_TASK_LIST_ID`. Without a name, the task list does not last from one session to the next. You lose your tasks and you do not know why.

### Steps

1. Claude starts a session and runs the hook.
2. The hook gives `process.env.CLAUDE_CODE_TASK_LIST_ID` to `checkTaskListId` in `shared/task-list-id.ts`.
3. If the value is empty or missing, the hook prints a JSON object with a `systemMessage`. The message tells you to add `"env":{"CLAUDE_CODE_TASK_LIST_ID":"<project name>"}` to the project `.claude/settings.json`.
4. If the value is set, the hook prints nothing.

The hook has no paths and no tunable numbers. It needs no `.env` value.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test check-task-list-id/check-task-list-id.test.ts` from the `claude_hooks` folder.
