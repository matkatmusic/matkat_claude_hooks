# context-exit

It shows one message when the context reaches a set percent, so you can start a new chat.

A chat with a full context gets worse, and a message tells you when to hand off to a fresh chat.

## Install

Start Claude with the mod:

```sh
claude --plugin-dir /path/to/claude_hooks/context-exit/mod
```

## How it works

The mod watches how full the context is. After each reply, it checks the percent of the context in use. When the percent reaches 30, 50, or 80, it shows one message for that level in each session. The message tells you to start a new chat and to run the `handoff-state` skill.

## More details

The dispatcher does not run this mod. It is a separate plugin.

In a chat that `claude-tmux` did not start, the mod does not exit the chat. You decide.

In a chat that `claude-tmux` started, the mod starts a swap. See "The swap for claude-tmux chats".

### Set the value

The constant `WARNING_PERCENTS` at the top of `mod/hooks/register.ts` sets the context percents where the mod shows a message.

### The swap for claude-tmux chats

A swap moves the work from a full chat to a new chat. Only chats that `claude-tmux` starts get a swap. Other chats get only the messages.

The hook checks for a swap at the end of each turn. A swap starts when all of these are true:

- The chat is a `claude-tmux` chat.
- The context percent is at or above the swap percent.
- No background task runs.
- No swap is in progress.

There are two kinds of `claude-tmux` chat:

- One chat: the `CLAUDE_TMUX_NAME` value is set. The hook runs `claude-tmux/individualSession/swapSingleChat.ts`. That script makes the chat write a handoff file, opens a new chat, and closes the old chat.
- Team chat: the `CLAUDE_TMUX_TEAM_NAME` value is set. The hook runs `claude-tmux/teamSession/swapChat.ts` in the same way. The team value wins when both are set.

If a swap fails, the failure script runs: `swapSingleChatFailed.ts` for one chat, `swapFailed.ts` for a team chat. It leaves a marker file. At a later turn end, the hook sees the marker and starts the swap again.

In one-chat mode, the hook shows a message when the swap starts. The hook also drops each prompt that you type into the old chat, and it shows the reason. Prompts that start with `/` pass. All prompts pass after a failed swap.

The full description is in `../claude-tmux/README.md`.

#### The swap percent

The setting `CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT` in `dispatcher/dispatch.json` sets the swap percent. The default is 30.

In one-chat mode, the environment value `CLAUDE_TMUX_SWAP_PERCENT` replaces the setting for that chat. The value must be a whole number. The hook throws an error for any other value. Team chats use only the setting.

The settings `CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_SWAP_TOAST` and `CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_PROMPT_DROP_REASON` set the two texts for one-chat mode.

### The handoff skill

The message names the skill `/matkat-hooks:handoff-state`. That skill comes from the main `claude_hooks` plugin. Load it with `--plugin-dir /path/to/claude_hooks`.

### Run the tests

- Mod: `claude plugin test context-exit/mod`

### Limit

The message is a toast that stays on screen for 60 seconds. The same text also stays in the status line until the next message.
