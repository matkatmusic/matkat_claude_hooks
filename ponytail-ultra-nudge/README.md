# ponytail-ultra-nudge

It tells the agent to use the ponytail skill at the ultra level before it answers, until the agent does so once in the session.

You want ultra mode in every session, and the hook reminds the agent so you do not type the same words again and again.

## Install

1. Run `./install.sh` once in the `claude_hooks` folder. It installs the ponytail plugin.

2. Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "UserPromptSubmit", command: ["node", `${import.meta.dirname}/../ponytail-ultra-nudge/ponytail-ultra-nudge.ts`], enabled: true },
```

## How it works

The hook runs each time you send a prompt. It checks the session state file and the transcript for a use of the ponytail skill at the ultra level. If it finds one, it records that in the state file and stays quiet for the rest of the session. If it finds none, it adds a message that tells the agent to invoke the skill with `args: "ultra"`.

## More details

### The problem it solves

The ponytail skill makes the agent write less code. The ultra level is the strictest one. The agent forgets to use it, and you must remind it each session.

### What it needs

The ponytail plugin. Run `./install.sh` in the `claude_hooks` folder.

### Steps

1. You send a prompt and Claude runs the hook.
2. The hook reads the session state file. If the file says ultra is done, the hook stops and prints nothing.
3. If not, the hook reads the session transcript. It looks for the typed command `/ponytail:ponytail ultra` or a `Skill` tool call for `ponytail:ponytail` with `ultra` in the arguments.
4. If it finds one, it writes `ponytailUltraInvoked: true` to the session state file. The state file is in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `.env`.
5. If it finds none, it prints a JSON object with a message. The message tells the agent to invoke the skill with `args: "ultra"`.

The hook has no paths and no tunable numbers to set. It needs no `.env` value of its own.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test ponytail-ultra-nudge/ponytail-ultra-nudge.test.ts` from the `claude_hooks` folder.
