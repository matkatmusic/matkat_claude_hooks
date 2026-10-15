# debt-ratchet

## What it does

It runs when Claude stops a turn. A subagent stop also runs it. It finds the `.ts` files that were edited in the turn. It runs eslint with `--fix` on each file. It counts the eslint findings that remain. It counts one extra point for each file that has no test file. It blocks the stop if the total did not drop. It also blocks the stop if a file is too long.

`debt-ratchet-report.ts` is a second script. It counts the same debt for every `.ts` file in a git repo. It never blocks. You run it by hand.

## The problem it solves

Claude writes code fast. The code can drift from the style rules of a project. A style rule that only warns is easy to ignore. Long files and files with no tests also pile up.

## Why it was made

The hook makes the style debt go down and not up. It saves the debt total of each session in a ledger file. Each new stop must show a lower total than the ledger. When the debt is stuck, the hook tells Claude to send the flagged lines to a subagent. A hard line limit keeps each file small.

## How it works

1. The hook reads the transcript. It collects the files that Claude and its subagents edited in this turn.
2. It skips test files and duplicate paths.
3. For each file, `debt-compute.ts` runs eslint `--fix`. It then counts the findings with the rules in `eslint.config.js`. It adds one point if the file has no test file.
4. A test file can sit next to the source file as `<name>.test.ts`. It can also sit in `tests/<name>.test.ts` or `tests/test-<name>.ts` at the repo root. A `.d.ts` file needs no test.
5. The hook adds the new counts to the ledger of the session. The ledger is one JSON file for each session.
6. It blocks the stop when a file is over the line limit. It also blocks when the total is above the debt target and did not drop below the ledger total. The message lists the flagged lines.
7. If eslint reformatted a file, the hook tells Claude not to undo it.
8. Ledger files older than the age limit are removed.

`eslint.config.js` has the rules and the `FUNCTION_VERBS` list. A function name must start with one of those verbs. The hook runs eslint from `claude_hooks/node_modules`. Run `bun install` in the `claude_hooks` folder first.

## .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR` | The folder for ledger files. Use a full path. |
| `CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS` | The age at which a ledger file is removed, in milliseconds. |
| `CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES` | The most lines a file may have. |
| `CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET` | A total at or below this number never blocks. |
| `CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE` | The number of flagged spots one subagent should fix. |

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add these entries to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "Stop", command: ["node", "/path/to/claude_hooks/debt-ratchet/debt-ratchet.ts"], timeout: 300, enabled: true },
{ event: "SubagentStop", command: ["node", "/path/to/claude_hooks/debt-ratchet/debt-ratchet.ts"], timeout: 300, enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run each file from the `claude_hooks` folder, for example `node --test debt-ratchet/debt-ratchet-compute.test.ts`. Most tests run eslint, so the eslint packages must be in `claude_hooks/node_modules`.
