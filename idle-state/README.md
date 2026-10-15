# idle-state

## What it does
This folder has two parts.

- The mod (`mod/`) watches a chat. When the chat sits idle for a set time, the mod asks Claude to write a state file. The state file is JSON. It holds the work done, the work left, the files changed, the programs running, and the traps to avoid. Then the mod exits the chat.
- The reader (`idle-state-reader.ts`) is a SessionStart hook. When a new chat starts, it lists the state files made in a set window of time. It tells Claude to read them.

## The problem it solves
Claude keeps a cache of the chat. The cache expires when the chat is idle for too long. After that, each prompt costs much more, and the chat is slow. You lose the context of the chat when you start over.

## Why it was made
A fresh chat should continue the old work without loss. The state file keeps the facts. The reader hands the facts to the new chat.

## How it works
1. After each reply, the mod starts a timer. A new prompt cancels the timer.
2. If the timer ends, the mod checks that it is not very late. A late timer means the computer slept and the cache is already gone. The mod does nothing in that case.
3. The mod sends a prompt. The prompt asks for a JSON object that follows `mod/hooks/state_file_template.json`.
4. The mod saves the answer in the state folder of the project. It writes a `.gitignore` there so git ignores the files.
5. The mod checks which listed programs still run, and adds the process numbers to the file.
6. The mod runs `exit`. If programs still run, Claude asks what to do with them. The mod pushes the key for "continue" after a short delay. This uses `python3` and the terminal device, so it works on macOS and Linux only.
7. Any new prompt in the old chat is dropped. The message tells you to start a new chat.
8. In the new chat, the reader finds the state files in the project folder that are newer than the window. It prints one line that names them.

## Set the values
Add these lines to `.env`. A missing value makes the reader throw an error.

```
CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS=86400000
CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME=.idleState
```

The mod cannot read `.env`. It runs in a sandbox with no file system or Node. It reads these values from the environment of the Claude process. Set them in your shell, or in the `env` block of `settings.json`, before you start Claude. A missing value makes the mod throw an error.

```
CLAUDE_HOOKS_IDLE_STATE_IDLE_MS=3300000
CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS=180000
CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS=1000
CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME=.idleState
```

- `CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS`: the reader lists state files newer than this many milliseconds.
- `CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME`: the folder in the project that holds the state files. The reader and the mod must use the same name.
- `CLAUDE_HOOKS_IDLE_STATE_IDLE_MS`: how long the chat must sit idle before the mod writes the state file.
- `CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS`: a timer later than this means the computer slept, so the mod does nothing.
- `CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS`: the wait before the mod pushes the key that answers the background work question.

## Turn it on
Turn on the reader alone: paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Turn on the reader through the dispatcher list: add this entry to the list that `CLAUDE_HOOKS_LIST` points to.

```ts
{ event: "SessionStart", command: ["node", `${import.meta.dirname}/../idle-state/idle-state-reader.ts`], enabled: false },
```

Do not use both ways at the same time. Claude would list the files twice.

Turn on the mod: start Claude with `--plugin-dir /path/to/claude_hooks/idle-state/mod`. The dispatcher does not run the mod.

## Run the tests
- Reader: `node --test idle-state/idle-state-reader.test.ts`
- Mod: `claude plugin test idle-state/mod`
