# unlisted-items

It blocks the end of a reply that names work still to do when that work is not on the task list, so Claude adds it first.

A task list only helps when it holds all the work.

## Install

1. Add these lines to `.env`:

```sh
CLAUDE_HOOKS_TASKS_DIR=/Users/you/.claude/tasks
CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH=5
CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS=2
```

2. Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "Stop", command: ["node", `${import.meta.dirname}/../unlisted-items/unlisted-items.ts`], enabled: true },
```

## How it works

When Claude stops, the hook looks in the last reply for phrases such as "still needs", "todo:", and "next step:". It compares each matching line with the open tasks of the session by shared long words. For each line that is not on the list, it blocks the stop and tells Claude to add the work with TaskCreate.

## More details

### The problem it solves

Claude often says "this still needs to be written" and then stops. The work is lost. Nobody tracks it.

### Steps

1. The hook runs when Claude stops.
2. It reads the last reply and looks for phrases such as "still needs", "todo:", and "next step:".
3. If it finds no phrase, it does nothing.
4. It reads the open tasks in the task folder for this session. The session uses `CLAUDE_CODE_TASK_LIST_ID` if set, or the session id.
5. A line counts as listed when it shares enough long words with one open task subject.
6. For each line that is not listed, the hook blocks the stop. It tells Claude to add each one with TaskCreate.
7. If the hook already blocked once in this turn, it does nothing. This prevents an endless loop.

The match counts shared words only. It does not check meaning. A task with different words can look unlisted.

### The .env values

A missing value makes the hook throw an error.

- `CLAUDE_HOOKS_TASKS_DIR` is the folder that holds one task folder for each task list. Use a full path. It must be `<CLAUDE_CONFIG_DIR>/tasks` when `CLAUDE_CONFIG_DIR` is set. If not, it must be `~/.claude/tasks`.
- `CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH` is how many letters a word needs to count.
- `CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS` is how many counted words a line must share with a task.

### Turn it on alone

Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Do not use both ways at the same time. Claude would be blocked twice.
