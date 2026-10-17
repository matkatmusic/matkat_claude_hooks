# idle-state

It saves the state of an idle chat to a file, then hands that file to the next chat so the work can continue.

A fresh chat should continue the old work without loss, and the state file keeps the facts.

## Install

1. Add this line to `.env`:

```sh
CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS=86400000
```

2. Set `enabled: true` on these two entries in `dispatcher/hooks-list.ts`:

```ts
{ event: "SessionStart", command: ["node", `${import.meta.dirname}/../idle-state/idle-state-reader.ts`], enabled: true },
{ event: "Stop", command: ["node", `${import.meta.dirname}/../idle-state/idle-state-check.ts`], enabled: true },
```

3. Start Claude with the mod. The dispatcher does not run the mod.

```sh
claude --plugin-dir /path/to/claude_hooks/idle-state/mod
```

## How it works

The mod waits after each reply. When the chat sits idle for a set time, it asks Claude to write a JSON state file, saves it in the project, and exits the chat. In the new chat, the reader (`idle-state-reader.ts`) lists the recent state files and tells Claude to read them. The check (`idle-state-check.ts`) blocks the end of the first turn until Claude reads and names each file.

## More details

### What the parts are

- The mod (`mod/`) watches a chat. When the chat sits idle for a set time, the mod asks Claude to write a state file. The state file is JSON. It holds the work done, the work left, the files changed, the programs running, and the traps to avoid. Then the mod exits the chat.
- The reader (`idle-state-reader.ts`) is a SessionStart hook. When a new chat starts, it lists the state files made in a set window of time. It tells Claude to read them.
- The check (`idle-state-check.ts`) is a Stop hook. It makes sure Claude does what the reader asked.

The mod also writes the state file when you run `exit` yourself, before the chat closes.

### The problem it solves

Claude keeps a cache of the chat. The cache expires when the chat is idle for too long. After that, each prompt costs much more, and the chat is slow. You lose the context of the chat when you start over.

### Steps

1. After each reply, the mod starts a timer. A new prompt cancels the timer.
2. If the timer ends, the mod checks that it is not very late. A late timer means the computer slept and the cache is already gone. The mod does nothing in that case.
3. The mod sends a prompt. The prompt asks for a JSON object that follows `shared/idle-state-template.json`.
4. The mod saves the answer in the state folder of the project. It writes a `.gitignore` there so git ignores the files.
5. The mod checks which listed programs still run, and adds the process numbers to the file.
6. The mod runs `exit`. If programs still run, Claude asks what to do with them. The mod pushes the key for "continue" after a short delay. This uses `python3` and the terminal device, so it works on macOS and Linux only.
7. Any new prompt in the old chat is dropped. The message tells you to start a new chat.
8. In the new chat, the reader finds the state files in the project folder that are newer than the window. It prints one line that names them. It also saves their paths in the session state file.
9. At the end of the first turn, the check reads the saved paths. It blocks the stop until Claude read each file and named each file in any reply in the first turn. A name is the file name without `.json`. The check does nothing after the first turn.

The check works only when the reader entry is enabled in the list that `CLAUDE_HOOKS_LIST` points to.

### Values

A missing `.env` value makes the reader throw an error.

- `CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS`: the reader lists state files newer than this many milliseconds.

The constant `IDLE_STATE_FOLDER_NAME` (`.idleState`) at the top of `idle-state-reader.ts` and `mod/hooks/register.ts` names the state folder. Both files must use the same name.

The constants `IDLE_MINUTES`, `LATE_LIMIT_MINUTES`, and `EXIT_KEY_DELAY_MINUTES` at the top of `mod/hooks/register.ts` set the idle time, the sleep limit, and the key delay.

### Turn the reader on alone

Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Do not use both ways at the same time. Claude would list the files twice.

### Run the tests

- Reader: `node --test idle-state/idle-state-reader.test.ts`
- Check: `node --test idle-state/idle-state-check.test.ts`
- Mod: `claude plugin test idle-state/mod`
