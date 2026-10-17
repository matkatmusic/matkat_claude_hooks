# context-exit

## What it does
The mod watches how full the context is. After each reply, it checks the percent of the context in use. When the percent reaches the limit, the mod shows one message. It shows the message once for each session. The message tells you to start a new chat and to run the `handoff-state` skill.

The mod does not exit the chat. You decide.

## Set the value
The constant `LIMIT_PERCENT` at the top of `mod/hooks/register.ts` sets the context percent where the mod shows the message.

## Turn it on
Start Claude with `--plugin-dir /path/to/claude_hooks/context-exit/mod`. The dispatcher does not run the mod.

The message names the skill `/matkat-hooks:handoff-state`. That skill comes from the main `claude_hooks` plugin. Load it with `--plugin-dir /path/to/claude_hooks`.

## Run the tests
- Mod: `claude plugin test context-exit/mod`

## Limit
The message is a toast. It stays on screen for a few seconds.
