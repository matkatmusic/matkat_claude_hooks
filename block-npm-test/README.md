# block-npm-test

It blocks test commands in every folder, runs the tests in the background, and tells Claude where to read the result.

A test run can take a long time and can fill the context of Claude with a long log.

## Install

1. The four values have defaults in `dispatcher/dispatch.json`. To change one, set it in `dispatcher/user-dispatch.json`:

```json
{ "values": { "block-npm-test": { "CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR": "/path/to/test-logs" } } }
```

2. Set this entry to `true` in `dispatcher/user-dispatch.json`:

```json
{ "enablements": { "block-npm-test": { "PreToolUse": true } } }
```

## How it works

The hook runs before every Bash command, in every folder. It finds a test command and blocks it. If the command is safe, the hook runs the whole command as typed, from the folder of the chat, in a background script with a kill timer. The block message gives Claude a short monitor command. The monitor waits for the run to end and prints the exit code and the log path.

## More details

### The problem it solves

A test run can take a long time. A Bash call that waits for it can hang the session or hit a time limit. A full test log can also fill the context of Claude with text it does not need.

### What it needs

The folder does not need a `package.json`.

### Safe commands

The background run gets no approval question. So the hook runs a command only if each part is `cd`, `mkdir`, or a test command.

- Join the parts with `&&`, `;`, or a new line.
- `2>&1` is allowed. Variables such as `$HOME` are allowed.
- All other commands, `$(...)`, backticks, brackets, pipes, `&`, `||`, backslashes, and file redirects are not allowed.
- `bash -c` is not allowed.
- A quoted value before a test command, such as `NAME="value" bun test`, is not allowed.

If a command is not safe, the hook blocks it, runs nothing, and says: run the tests alone.

### Test commands it knows

It knows these test commands: `npm test`, `npm t`, `npm run test:*`, `yarn test`, `pnpm test`, `bun test`, `node --test`, `tsx --test`, `jest`, `vitest`, and `mocha`. It also knows `npx` with `jest`, `vitest`, or `mocha`. It skips `npm run test:baseline`.

### Steps

1. The hook blocks test commands in every folder. It does not look for a `package.json`.
2. `blockNpmTestSplit.ts` cuts the Bash line into simple commands. `blockNpmTestFind.ts` finds the test commands.
3. `blockNpmTestSafe.ts` decides if the whole command is safe.
4. The hook makes the log folder and removes old logs.
5. `blockNpmTestScripts.ts` builds a shell script. The script runs the typed command with `bash` and writes `<log>.done` when the run ends. A timer kills the run if it takes too long. One command makes one log. A missing folder shows as an error in the log.
6. The hook starts the script in the background. It blocks the original command. Its message gives the command `monitorTestRun.ts <log>`.
7. `monitorTestRun.ts` waits for the `.done` file. It prints the result, or it says the run is still in progress.

### Settings values

The hook reads these values from `input.settings`. The defaults are in `dispatch.json`.

| Name | What it sets |
| --- | --- |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR` | The folder for test logs. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS` | Seconds before the timer kills a test run. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS` | Not used. |
| `CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS` | The age at which old logs are removed, in milliseconds. |

The constants `MONITOR_WAIT_SECONDS` and `MONITOR_POLL_SECONDS` at the top of `monitorTestRun.ts` set the monitor wait and the check interval.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run each file from the `claude_hooks` folder, for example `node --test block-npm-test/blockNpmTest.test.ts`.
