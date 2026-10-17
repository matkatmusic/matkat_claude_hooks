# block-npm-test

## What it does

It runs before every Bash command in a node project. It looks for a test command. If it finds one, it blocks the command and runs the tests in the background. It tells Claude where to read the result.

It knows these test commands: `npm test`, `npm run test:*`, `yarn test`, `pnpm test`, `bun test`, `node --test`, `tsx --test`, `jest`, `vitest`, and `mocha`. It skips `npm run test:baseline`.

## The problem it solves

A test run can take a long time. A Bash call that waits for it can hang the session or hit a time limit. A full test log can also fill the context of Claude with text it does not need.

## What it needs

The project needs a `package.json`.

## Why it was made

The hook makes Claude start the tests in the background. Claude then waits with a small monitor command. The monitor prints the end of the run and the log path. A full-suite run prints only the failed tests, or the words "all passing".

## How it works

1. The hook checks for a `package.json` in the folder or in a folder above it. If there is none, it does nothing.
2. `block-npm-test-split.ts` cuts the Bash line into simple commands. `block-npm-test-find.ts` finds the first test command, its file, its `cd` folder, and its `VAR=value` words.
3. If the `cd` folder does not exist, the hook blocks the command and says so.
4. The hook makes the log folder and removes old logs.
5. `block-npm-test-scripts.ts` builds a shell script. The script runs the tests and writes `<log>.done` when the run ends. A timer kills the run if it takes too long.
6. The hook starts the script in the background. It blocks the original command. Its message gives the command `monitor-test-run.ts <log>`.
7. `monitor-test-run.ts` waits for the `.done` file. It prints the result, or it says the run is still in progress.

## .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR` | The folder for test logs. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS` | Seconds before the timer kills a test run. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS` | The time limit for one test, in milliseconds. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS` | The age at which old logs are removed, in milliseconds. |

The constants `MONITOR_WAIT_SECONDS` and `MONITOR_POLL_SECONDS` at the top of `monitor-test-run.ts` set the monitor wait and the check interval.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add this entry to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "PreToolUse", matcher: "Bash", command: ["node", "/path/to/claude_hooks/block-npm-test/block-npm-test.ts"], timeout: 300, enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run each file from the `claude_hooks` folder, for example `node --test block-npm-test/block-npm-test.test.ts`.
