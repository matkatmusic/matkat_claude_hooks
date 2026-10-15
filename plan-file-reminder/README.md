# plan-file-reminder

## What it does
After Claude writes or edits a plan file, this hook adds a short reminder to the chat. The reminder tells Claude to make the plan follow your planning guide.

## The problem it solves
Claude forgets your planning rules while it edits a plan. The plans then drift from the format you want.

## Why it was made
You keep planning rules in one guide file. A reminder at the moment of the edit is more reliable than hoping Claude remembers the rules.

## How it works
1. The hook runs after every Write or Edit tool call.
2. It checks two things. Is Claude in plan mode? Does the file path contain `/plans/`?
3. If one answer is yes, it prints the reminder with the path of your planning guide.
4. If both answers are no, it prints nothing.

The guide path comes from `CLAUDE_HOOKS_PLANNING_GUIDE_PATH` in the `.env` file. If the value is missing, the hook throws an error.

## Set the guide path
Add this line to `.env`:

```
CLAUDE_HOOKS_PLANNING_GUIDE_PATH=~/.claude/guides/planning.md
```

## Turn it on alone
Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

## Turn it on through the dispatcher list
Add this entry to the list that `CLAUDE_HOOKS_LIST` points to. Set `enabled` to `true`.

```ts
{ event: "PostToolUse", matcher: "Write|Edit", command: ["node", `${import.meta.dirname}/../plan-file-reminder/plan-file-reminder.ts`], enabled: true },
```

Do not use both ways at the same time. The reminder would show twice.
