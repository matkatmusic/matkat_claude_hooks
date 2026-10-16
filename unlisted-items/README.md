# unlisted-items

## What it does
When Claude ends a turn, this hook reads the last reply. If the reply says work is still to do, the hook checks the task list. If that work is not on the list, the hook blocks the stop. Claude must add the work to the task list first.

## The problem it solves
Claude often says "this still needs to be written" and then stops. The work is lost. Nobody tracks it.

## Why it was made
A task list only helps when it holds all the work. This hook makes Claude put every named piece of work on the list.

## How it works
1. The hook runs when Claude stops.
2. It reads the last reply and looks for phrases such as "still needs", "todo:", and "next step:".
3. If it finds no phrase, it does nothing.
4. It reads the open tasks in the task folder for this session. The session uses `CLAUDE_CODE_TASK_LIST_ID` if set, or the session id.
5. A line counts as listed when it shares enough long words with one open task subject.
6. For each line that is not listed, the hook blocks the stop. It tells Claude to add each one with TaskCreate.
7. If the hook already blocked once in this turn, it does nothing. This prevents an endless loop.

The match counts shared words only. It does not check meaning. A task with different words can look unlisted.

## Set the values
Add these lines to `.env`. A missing value makes the hook throw an error.

```
CLAUDE_HOOKS_TASKS_DIR=/Users/you/.claude/tasks
CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH=5
CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS=2
```

- `CLAUDE_HOOKS_TASKS_DIR` is the folder that holds one task folder for each task list. Use a full path. It must be `<CLAUDE_CONFIG_DIR>/tasks` when `CLAUDE_CONFIG_DIR` is set. If not, it must be `~/.claude/tasks`.
- `CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH` is how many letters a word needs to count.
- `CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS` is how many counted words a line must share with a task.

## Turn it on alone
Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

## Turn it on through the dispatcher list
Add this entry to the list that `CLAUDE_HOOKS_LIST` points to. Set `enabled` to `true`.

```ts
{ event: "Stop", command: ["node", `${import.meta.dirname}/../unlisted-items/unlisted-items.ts`], enabled: true },
```

Do not use both ways at the same time. Claude would be blocked twice.
