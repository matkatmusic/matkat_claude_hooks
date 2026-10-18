# status-line

It shows a status line under the prompt of Claude Code, with the model, context, turns, tokens, and usage limits, and one line for each running subagent.

Usage limits and context size change while you work, and you do not see them unless you stop and ask.

## Install

1. Paste the `statusLine` and `subagentStatusLine` settings into `settings.json`. The dispatcher cannot set them. Change `/path/to/claude_hooks` to the real folder on your computer.

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/claude_hooks/status-line/status.ts\"",
    "refreshInterval": 3
  },
  "subagentStatusLine": {
    "type": "command",
    "command": "node \"/path/to/claude_hooks/status-line/subagentStatusLine.ts\"",
    "refreshInterval": 3
  }
}
```

2. Set these two values in `.env`:

```sh
CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT=/path/to/scratch-root
CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS=...
```

3. Set `enabled: true` on these four entries in `dispatcher/hooks-list.ts`. They run the `turn-counter` hook, which counts the turns that the status line shows.

```ts
{ event: "SessionStart", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: true },
{ event: "Stop", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: true },
{ event: "StopFailure", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: true },
{ event: "SessionEnd", command: ["node", `${import.meta.dirname}/../status-line/turn-counter.ts`], enabled: true },
```

## How it works

The `turn-counter` hook writes a list of sittings, with turns and tokens, into the session state file. `status.ts` reads the status data from stdin and the sittings from that file, and prints four lines. `subagentStatusLine.ts` prints one line for each subagent. Colors go from green to red as a value gets close to its limit.

## More details

### What the status line shows

The status line shows the model, the folder, the git branch, the context bar, the turn count, and the token counts. It also shows the five hour limit, the week limit, the day of the week, and the prompt cache timer. One line for each running subagent shows the model, effort, name, task, run time, and tokens.

### The problem it solves

Usage limits and context size change while you work. You do not see them unless you stop and ask. The status line shows them all the time. Colors go from green to red as a value gets close to its limit.

### Why it was made

A forced break at the limit costs a lot of time. The status line lets you plan before it happens. The color of the reset timer shows how much a break would hurt. The week budget shows if you spend too fast for the day of the week.

### Steps

1. `turn-counter.ts` runs on SessionStart, Stop, StopFailure, and SessionEnd. It writes a list of sittings into the session state file. Each sitting holds the start time, the turns, the end time, and the tokens in and out.
2. The tokens come from the transcript. The hook also adds the files of subagents and workflow agents.
3. On SessionStart the hook removes session state files that are older than the keep time.
4. `status.ts` reads the status data from stdin and the sittings from the session state file. It prints four lines.
5. `subagentStatusLine.ts` prints one line for each subagent: model, effort, name, task, run time, and tokens.
6. The other `status*.ts` files hold the colors, the format code, the file reading code, and the model names.

The session state file is in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `.env`.

### .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT` | The folder where workflow agents write their files. |
| `CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS` | Days to keep a session state file. |

The color thresholds are constants in `status_line_config.ts`.

Every name needs a value in `.env`. A missing name makes the hook stop with an error.

### Turn it on alone

Copy the blocks from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer. The file holds the two status line settings and the four `turn-counter` hooks.

The `statusLine` and `subagentStatusLine` settings always go in `settings.json`, also when you use the dispatcher. The dispatcher only runs the `turn-counter` hook.

Do not use both ways at the same time. The hook would run twice.

### Test

Run each file from the `claude_hooks` folder, for example `node --test status-line/status.test.ts`.
