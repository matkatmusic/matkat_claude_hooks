# context-exit

## What it does
The mod watches how full the context is. After each reply, it checks the percent of the context in use. When the percent reaches the limit, the mod shows one message. It shows the message once for each session. The message tells you to start a new chat and to run the `handoff-state` skill.

The mod does not exit the chat. You decide.

## Set the value
The mod cannot read `.env`. It reads the environment of the Claude process. Set the value in your shell, or in the `env` block of `settings.json`, before you start Claude. A missing value makes the mod throw an error.

```
CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT=30
```

- `CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT`: the context percent where the mod shows the message.

## Turn it on
Start Claude with `--plugin-dir /path/to/claude_hooks/context-exit/mod`. The dispatcher does not run the mod.

The message names the skill `/matkat-hooks:handoff-state`. That skill comes from the main `claude_hooks` plugin. Load it with `--plugin-dir /path/to/claude_hooks`.

## Run the tests
- Mod: `claude plugin test context-exit/mod`

## Limit
The message is a toast. It stays on screen for a few seconds.
