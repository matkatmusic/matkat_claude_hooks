# status-line

## What it does

It shows a status line under the prompt of Claude Code. It also shows one line for each running subagent. A hook named `turn-counter` counts the turns that the status line shows.

The status line shows the model, the folder, the git branch, the context bar, the turn count, and the token counts. It also shows the five hour limit, the week limit, the day of the week, and the prompt cache timer.

## The problem it solves

Usage limits and context size change while you work. You do not see them unless you stop and ask. The status line shows them all the time. Colors go from green to red as a value gets close to its limit.

## Why it was made

A forced break at the limit costs a lot of time. The status line lets you plan before it happens. The color of the reset timer shows how much a break would hurt. The week budget shows if you spend too fast for the day of the week.

## How it works

1. `turn-counter.ts` runs on SessionStart, Stop, StopFailure, and SessionEnd. It writes a list of sittings into the session state file. Each sitting holds the start time, the turns, the end time, and the tokens in and out.
2. The tokens come from the transcript. The hook also adds the files of subagents and workflow agents.
3. On SessionStart the hook removes session state files that are older than the keep time.
4. `status.ts` reads the status data from stdin and the sittings from the session state file. It prints four lines.
5. `subagentStatusLine.ts` prints one line for each subagent: model, effort, name, task, run time, and tokens.
6. The other `status*.ts` files hold the colors, the format code, the file reading code, and the model names.

The session state file is in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `.env`.

## .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT` | The folder where workflow agents write their files. |
| `CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS` | Days to keep a session state file. |
The color thresholds are constants in `status_line_config.ts`.

Every name needs a value in `.env`. A missing name makes the hook stop with an error.

## Turn it on alone

Copy the blocks from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

The `statusLine` and `subagentStatusLine` settings always go in `settings.json`. The dispatcher only runs the `turn-counter` hook. Add these entries to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "SessionStart", command: ["node", "/path/to/claude_hooks/status-line/turn-counter.ts"], enabled: true },
{ event: "Stop", command: ["node", "/path/to/claude_hooks/status-line/turn-counter.ts"], enabled: true },
{ event: "StopFailure", command: ["node", "/path/to/claude_hooks/status-line/turn-counter.ts"], enabled: true },
{ event: "SessionEnd", command: ["node", "/path/to/claude_hooks/status-line/turn-counter.ts"], enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run each file from the `claude_hooks` folder, for example `node --test status-line/status.test.ts`.
