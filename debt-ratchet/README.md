# debt-ratchet

It runs eslint on the `.ts` files that Claude edited in a turn and blocks the stop unless the style debt dropped.

It makes the style debt go down and not up, because a style rule that only warns is easy to ignore.

## Install

1. Run `npm install` in the `claude_hooks` folder. The hook needs the eslint packages there.

2. Set these five values in `.env`:

```sh
CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR=/path/to/debt-ledgers
CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS=...
CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES=...
CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET=...
CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE=...
CLAUDE_HOOKS_DEBT_RATCHET_MIN_FILE_DEBT=...
```

3. Set `enabled: true` on these two entries in `dispatcher/hooks-list.ts`:

```ts
{ event: "Stop", command: ["node", `${import.meta.dirname}/../debt-ratchet/debt-ratchet.ts`], timeout: 300, enabled: true },
{ event: "SubagentStop", command: ["node", `${import.meta.dirname}/../debt-ratchet/debt-ratchet.ts`], timeout: 300, enabled: true },
```

## How it works

When a turn stops, the hook reads the transcript and finds the `.ts` files that Claude and its subagents edited. It runs eslint `--fix` on each file and counts the findings that remain, plus one point for each file with no test file. It saves the total in a ledger file for the session. It blocks the stop when a file is too long, or when the total is above the target and did not drop below the ledger total.

## More details

### What it does

It runs when Claude stops a turn. A subagent stop also runs it. It finds the `.ts` files that were edited in the turn. It runs eslint with `--fix` on each file. It counts the eslint findings that remain. It counts one extra point for each file that has no test file. It blocks the stop if the total did not drop. It also blocks the stop if a file is too long. A re-entrant stop (when `stop_hook_active` is true) is checked again. The hook counts its blocks in a chain. It passes after 3 blocks in a row.
`debt-ratchet-report.ts` is a second script. It counts the same debt for every `.ts` file in a git repo. It never blocks. You run it by hand.

### The problem it solves

Claude writes code fast. The code can drift from the style rules of a project. A style rule that only warns is easy to ignore. Long files and files with no tests also pile up.

### Why it was made

The hook saves the debt total of each session in a ledger file. Each new stop must show a lower total than the ledger. When the debt is stuck, the hook tells Claude to send the flagged lines to a subagent. A hard line limit keeps each file small.

### Steps

1. The hook reads the transcript. It collects the files that Claude and its subagents edited in this turn.
2. It skips test files and duplicate paths for the eslint count. An edited test file still counts toward the line limit.
3. For each file, `debt-compute.ts` runs eslint `--fix`. It then counts the findings with the rules in `eslint.config.js`. It adds one point if the file has no test file.
4. A test file can sit next to the source file as `<name>.test.ts`. It can also sit in `tests/<name>.test.ts` or `tests/test-<name>.ts` at the repo root. A `.d.ts` file needs no test.
5. The hook adds the new counts to the ledger of the session. The ledger is one JSON file for each session.
6. It blocks the stop when a file is over the line limit. It also blocks when the total is above the debt target and did not drop below the ledger total. The message lists the flagged lines.
7. If eslint reformatted a file, the hook tells Claude not to undo it.
8. Ledger files older than the age limit are removed.

`eslint.config.js` has the rules and the `FUNCTION_VERBS` list. A function name must start with one of those verbs. The hook runs eslint from `claude_hooks/node_modules`. Run `npm install` in the `claude_hooks` folder first.

### .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR` | The folder for ledger files. Use a full path. |
| `CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS` | The age at which a ledger file is removed, in milliseconds. |
| `CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES` | The most lines a file may have. |
| `CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET` | A total at or below this number never blocks. |
| `CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE` | The number of flagged spots one subagent should fix. |
| `CLAUDE_HOOKS_DEBT_RATCHET_MIN_FILE_DEBT` | Style debt blocks only when one file has at least this many flagged spots. The default is 10. |

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run each file from the `claude_hooks` folder, for example `node --test debt-ratchet/debt-compute.test.ts`. Most tests run eslint, so the eslint packages must be in `claude_hooks/node_modules`.
