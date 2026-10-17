# block-npm-test

It blocks test commands in a node project, runs the tests in the background, and tells Claude where to read the result.

A test run can take a long time and can fill the context of Claude with a long log.

## Install

1. Set these four values in `.env`:

```sh
CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR=/path/to/test-logs
CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS=...
CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS=...
CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS=...
```

2. Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "PreToolUse", matcher: "Bash", command: ["node", `${import.meta.dirname}/../block-npm-test/block-npm-test.ts`], timeout: 300, enabled: true },
```

## How it works

The hook runs before every Bash command in a project that has a `package.json`. It finds a test command, blocks it, and starts the tests in a background script with a kill timer. The block message gives Claude a short monitor command. The monitor waits for the run to end and prints the result and the log path. A full-suite run prints only the failed tests, or the words "all passing".

## More details

### The problem it solves

A test run can take a long time. A Bash call that waits for it can hang the session or hit a time limit. A full test log can also fill the context of Claude with text it does not need.

### What it needs

The project needs a `package.json`.

### Test commands it knows

It knows these test commands: `npm test`, `npm t`, `npm run test:*`, `yarn test`, `pnpm test`, `bun test`, `node --test`, `tsx --test`, `jest`, `vitest`, and `mocha`. It also knows `npx` with `jest`, `vitest`, or `mocha`. It skips `npm run test:baseline`.

### Steps

1. The hook checks for a `package.json` in the folder or in a folder above it. If there is none, it does nothing.
2. `block-npm-test-split.ts` cuts the Bash line into simple commands. `block-npm-test-find.ts` finds the first test command, its file, its `cd` folder, and its `VAR=value` words.
3. If the `cd` folder does not exist, the hook blocks the command and says so.
4. The hook makes the log folder and removes old logs.
5. `block-npm-test-scripts.ts` builds a shell script. The script runs the tests and writes `<log>.done` when the run ends. A timer kills the run if it takes too long.
6. The hook starts the script in the background. It blocks the original command. Its message gives the command `monitor-test-run.ts <log>`.
7. `monitor-test-run.ts` waits for the `.done` file. It prints the result, or it says the run is still in progress.

### .env values

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR` | The folder for test logs. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS` | Seconds before the timer kills a test run. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS` | The time limit for one test, in milliseconds. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS` | The age at which old logs are removed, in milliseconds. |

The constants `MONITOR_WAIT_SECONDS` and `MONITOR_POLL_SECONDS` at the top of `monitor-test-run.ts` set the monitor wait and the check interval.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run each file from the `claude_hooks` folder, for example `node --test block-npm-test/block-npm-test.test.ts`.
