# context-exit

It shows one message when the context reaches a set percent, so you can start a new chat.

A chat with a full context gets worse, and a message tells you when to hand off to a fresh chat.

## Install

Start Claude with the mod:

```sh
claude --plugin-dir /path/to/claude_hooks/context-exit/mod
```

## How it works

The mod watches how full the context is. After each reply, it checks the percent of the context in use. When the percent reaches the limit, it shows one message for the session. The message tells you to start a new chat and to run the `handoff-state` skill.

## More details

The dispatcher does not run this mod. It is a separate plugin.

The mod does not exit the chat. You decide.

### Set the value

The constant `LIMIT_PERCENT` at the top of `mod/hooks/register.ts` sets the context percent where the mod shows the message.

### The handoff skill

The message names the skill `/matkat-hooks:handoff-state`. That skill comes from the main `claude_hooks` plugin. Load it with `--plugin-dir /path/to/claude_hooks`.

### Run the tests

- Mod: `claude plugin test context-exit/mod`

### Limit

The message is a toast. It stays on screen for a few seconds.
