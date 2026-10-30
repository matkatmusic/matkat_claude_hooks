# plan-file-reminder

After Claude writes or edits a plan file, it adds a short reminder that tells Claude to follow your planning guide.

Claude forgets your planning rules while it edits a plan, and a reminder at the moment of the edit is more reliable than hoping Claude remembers.

## Install

1. Add this line to `.env`:

```sh
CLAUDE_HOOKS_PLANNING_GUIDE_PATH=../plan-file-reminder/planning.md
```

2. Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "PostToolUse", matcher: "Write|Edit|MultiEdit|NotebookEdit", command: ["node", `${import.meta.dirname}/../plan-file-reminder/plan-file-reminder.ts`], enabled: true },
```

## How it works

The hook runs after every Write or Edit tool call. It checks if the file is inside the `plans` folder of the project (the folder in `cwd`). If yes, it prints a reminder with the path of your planning guide. If no, it prints nothing.

## More details

### The problem it solves

Claude forgets your planning rules while it edits a plan. The plans then drift from the format you want.

### Why it was made

You keep planning rules in one guide file.

### Steps

1. The hook runs after every Write or Edit tool call.
2. It checks one thing. Is the file inside the `plans` folder of the project?
3. If yes, it prints the reminder with the path of your planning guide.
4. If no, it prints nothing.

### The guide path

The guide path comes from `CLAUDE_HOOKS_PLANNING_GUIDE_PATH` in the `.env` file. The default is `../plan-file-reminder/planning.md`. A value that starts with `../` resolves from the `dispatcher` folder. If the value is missing, the hook throws an error.

### Turn it on alone

Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Do not use both ways at the same time. The reminder would show twice.
