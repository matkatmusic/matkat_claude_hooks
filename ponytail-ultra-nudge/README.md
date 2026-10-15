# ponytail-ultra-nudge

## What it does

It runs each time you send a prompt. It checks if the agent has used the ponytail skill at the ultra level in this session. If not, it tells the agent to do it before it answers you. When the agent has done it, the hook stays quiet for the rest of the session.

## The problem it solves

The ponytail skill makes the agent write less code. The ultra level is the strictest one. The agent forgets to use it, and you must remind it each session.

## Why it was made

You want ultra mode in every session. The hook reminds the agent for you, so you do not type the same words again and again.

## How it works

1. You send a prompt and Claude runs the hook.
2. The hook reads the session state file. If the file says ultra is done, the hook stops and prints nothing.
3. If not, the hook reads the session transcript. It looks for the typed command `/ponytail:ponytail ultra` or a `Skill` tool call for `ponytail:ponytail` with `ultra` in the arguments.
4. If it finds one, it writes `ponytailUltraInvoked: true` to the session state file. The state file is in `~/.claude/.dotfiles/`.
5. If it finds none, it prints a JSON object with a message. The message tells the agent to invoke the skill with `args: "ultra"`.

The hook has no paths and no tunable numbers to set. It needs no `.env` value.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add this entry to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "UserPromptSubmit", command: ["node", "/path/to/claude_hooks/ponytail-ultra-nudge/ponytail-ultra-nudge.ts"], enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run `node --test ponytail-ultra-nudge/ponytail-ultra-nudge.test.ts` from the `claude_hooks` folder.
