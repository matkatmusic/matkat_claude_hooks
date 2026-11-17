# claude-tmux

It is a shell command that starts Claude chats in tmux and swaps a chat for a new chat when its context passes a limit.

tmux is a tool that keeps terminal windows alive. The context is the memory a chat uses. A chat with a full context gets worse. This command moves the work to a fresh chat by itself.

## Install

1. Install `tmux` and `bun`.
2. Open a new terminal. The `claude-tmux` function comes from `claude/init.sh`, and an old terminal does not have it.
3. For `/tmux-new-helper`, set this entry to `true` in `dispatcher/user-dispatch.json`. The default in `dispatcher/dispatch.json` is `false`.

```json
{ "enablements": { "tmux-helper": { "UserPromptSubmit": true } } }
```

The swap needs the `context-exit` mod. The `claude` function in `init.sh` loads it.

## Commands

- `claude-tmux --name X [--model M]` starts one chat. This is the base mode.
- `claude-tmux --team --name X [--model M]` starts a team. Team mode builds on the base mode.

Start the command inside a git repository. Otherwise the base mode stops with an error. The command stops when a tmux session named X exists.

In a terminal, the command opens the new session. Inside tmux, it switches your view to the session.

## The swap of one chat

1. A chat finishes a reply with its context at or above the swap percent, and no background task runs.
2. The chat writes a handoff file in the `.idleState` folder at the git root. The handoff file is a note for the next chat.
3. A new chat opens in a new tmux window, next to the old window.
4. The new chat reads the handoff file and continues the work.
5. The old chat gets `/exit` and closes.

During the swap, the old chat drops each prompt you type, except a slash command. The swap also clears the old input box. The view moves to the new window only when the old window is the active window.

A failed swap shows a notice in the old chat. The old chat stays open. The error text goes to `dispatcher/claude-tmux-swap.log`.

## Chat names and numbers

A chat name is the counter name and a number. Example:

| Action | Chat name |
| --- | --- |
| `claude-tmux --name "clear roadmap"` | clear roadmap 1 |
| A swap of that chat | clear roadmap 2 |
| `/tmux-new-helper` | clear roadmap helper 1 |
| `/tmux-new-helper` again | clear roadmap helper 2 |
| A swap of "clear roadmap helper 1" | clear roadmap helper 3 |

Each counter name has its own count. The next number is the higher of the last number given and the number of the chat that swaps, plus one. No name repeats.

## The tracker file

The tracker file is `.claude_hooks/tmux-sessions/<tmux session id>.json`. It is in the git root of the first chat.

It holds the last number given for each counter name:

```json
{ "clear roadmap": 2, "clear roadmap helper": 2 }
```

A tmux session option, `@claude_tmux_tracker`, stores the path. A global tmux hook, `session-closed`, deletes the file when the session ends.

## The slash commands

- `/tmux-new-helper [model]` starts a helper chat in a new window next to the current window. The model is the setting `CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_MODEL`, `sonnet` by default. A helper swaps like any other chat.

`/tmux-new-helper` works only inside tmux. It also needs a git repository.

## Settings

Change a value in `dispatcher/user-dispatch.json`, in the section `claude-tmux`. The default is in `dispatcher/dispatch.json`.

| Name | Default | Meaning |
| --- | --- | --- |
| `CLAUDE_HOOKS_CLAUDE_TMUX_MODEL` | `fable` | Model of a chat started without `--model`. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_MODEL` | `sonnet` | Model of a helper chat without a typed model. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS` | `600` | Time a script waits for an open dialog to close. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_WAIT_SECONDS` | `600` | Time the old chat has to become idle and write the handoff file. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_CLOSE_WAIT_SECONDS` | `120` | Extra time for the old chat to close. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND` | text | Command sent to the old chat to write the handoff file. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_TAKEOVER_PROMPT` | text | First prompt of the new chat. |
| `CLAUDE_HOOKS_CLAUDE_TMUX_SWAP_FAILED_NOTICE` | text | Notice sent to the old chat after a failed swap. |

The section `context-exit` holds three more values:

- `CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT` is the swap percent. The default is `30`.
- `CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_SWAP_TOAST` is the message shown when a swap starts.
- `CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_PROMPT_DROP_REASON` is the message shown for a dropped prompt.

Team values are in the section `claude-tmux-team`.

### The swap percent for one chat

Set `CLAUDE_TMUX_SWAP_PERCENT` before the command:

```sh
CLAUDE_TMUX_SWAP_PERCENT=50 claude-tmux --name "clear roadmap"
```

The value is a whole number from 1 to 100. It applies to that chat, its next chats, and its helpers. Without it, the chat uses `CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT`. A bad value stops the start.

## Team mode

A team has these roles:

- Director: the first chat. It decides how to split the work.
- TeamLeader: runs the steps of one job.
- Read-Find-orchestrator, Planner, PlanReviewer, PlanAuditor, Build-orchestrator: five helper chats for each job.

The Director starts with the five helper chats. It runs one of these scripts from `teamSession/`:

- `leadJobDirectly.ts "JOB-TEXT"` makes the Director the TeamLeader and sends the job to the helper chats.
- `startJobTeam.ts "JOB-NAME" "JOB-TEXT"` starts a TeamLeader and five new helper chats for a job. The job works in its own git worktree, a second work folder for the same repository. The setting `MAX_TEAMS` limits the live jobs.
- `closeJobTeam.ts "JOB-NAME"` asks the TeamLeader for a handoff file, lists the uncommitted files, and stops the chats of that job. It keeps the work folder and the branches.
- `startTeamHelpers.ts` starts the five helper chats. Only the Director runs it.
- `sendToJob.ts <job> "<text>"` sends a message to the chat of a job. It starts the chat when none exists. The job `old-<job>` names the chat that is leaving.
- `swapChat.ts` and `swapFailed.ts` start from the `context-exit` mod. They replace a team chat that passed the limit with a new chat for the same job.
- `closeChat.ts <job>` closes the old chat of a job after a swap. The new chat runs it.

Each chat writes its commit message as one JSON object on one line:

```json
{"subject": "fix swap retry", "tasks": [540]}
```

## Folders

- `individualSession/`: start, swap, and helper scripts for one chat, and the naming and tracker code.
- `shared/`: code that reads the screen of a chat, sends text to a chat, and runs the swap steps. Both modes use it.
- `teamSession/`: team scripts and the team file.
- `runClaudeTmux.ts`: starts team mode when `--team` is present. Otherwise it starts the base mode.

## Known limits

- A swap starts only at the end of a reply. It waits while a background task runs.
- A failed swap is tried again at each reply end above the limit. There is no limit on the tries.
- When the new chat is ready but the old chat does not close, both chats stay open. Close the old window by hand. The old chat keeps dropping its prompts.
- A chat that `claude-tmux` did not start does not swap. This includes helper chats opened before this version.
- Team chats use the swap percent of `context-exit`. `CLAUDE_TMUX_SWAP_PERCENT` does not change them.
- A folder path with `'`, `"`, or `$` breaks the tmux hook that deletes the tracker file.
