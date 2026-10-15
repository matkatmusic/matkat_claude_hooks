# typecheck-on-stop

## What it does

It runs when Claude stops its reply, or when a subagent stops. It checks if Claude edited a `.ts` file in this turn. If so, it runs the TypeScript checker on the project. If the checker finds errors, the hook blocks the stop. It tells Claude to fix them.

## The problem it solves

Claude can edit a TypeScript file and stop while the project has type errors. The errors stay hidden until someone builds the project later.

## Why it was made

A type error is cheap to fix right after the edit. It costs much more later. The hook makes Claude fix every error before it stops, including errors in files it did not edit.

## How it works

1. Claude stops and runs the hook.
2. If the stop is a repeat caused by this hook, the hook exits. This prevents a loop.
3. If the project folder has no `tsconfig.json`, the hook exits.
4. The hook reads the transcript. For a main stop, it also reads the subagent transcripts that started in this turn. It collects the files that were edited.
5. If no edited file ends in `.ts`, the hook exits.
6. The hook runs `npx tsc --noEmit -p .` in the project folder.
7. If the checker passes, the hook prints nothing.
8. If the checker fails, the hook prints a JSON object with `decision: "block"` and a `reason`. The reason lists the error lines. It lists no more lines than the `.env` limit allows.

The hook imports `debt-transcript.ts` from `shared/`.

## The .env value

Add this line to the `.env` file in the `claude_hooks` folder:

```
CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES=20
```

It sets the most error lines that the hook puts in the reason.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add these entries to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "Stop", command: ["node", "/path/to/claude_hooks/typecheck-on-stop/typecheck-on-stop.ts"], timeout: 300, enabled: true },
{ event: "SubagentStop", command: ["node", "/path/to/claude_hooks/typecheck-on-stop/typecheck-on-stop.ts"], timeout: 300, enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run `node --test typecheck-on-stop/typecheck-on-stop.test.ts` from the `claude_hooks` folder.
