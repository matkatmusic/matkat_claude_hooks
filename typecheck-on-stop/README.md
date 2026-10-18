# typecheck-on-stop

It blocks the end of a reply, or of a subagent run, while the TypeScript checker reports errors after Claude edited a `.ts` file.

A type error is cheap to fix right after the edit and costs much more later.

## Install

1. Add this line to `.env`:

```sh
CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES=20
```

2. Set `enabled: true` on these two entries in `dispatcher/hooks-list.ts`:

```ts
{ event: "Stop", command: ["node", `${import.meta.dirname}/../typecheck-on-stop/typecheck-on-stop.ts`], timeout: 300, enabled: true },
{ event: "SubagentStop", command: ["node", `${import.meta.dirname}/../typecheck-on-stop/typecheck-on-stop.ts`], timeout: 300, enabled: true },
```

## How it works

When Claude stops, the hook reads the transcript and collects the files that were edited in this turn. If one ends in `.ts`, `.tsx`, `.mts` or `.cts`, it runs the TypeScript checker on the project. The hook blocks the stop only for errors in the files Claude edited. It lists errors in other files as a note. The reason has a line with the error counts. If the checker fails to start, the hook blocks and shows the checker output. The hook blocks at most 3 times in a row for one session, then it lets the stop pass.

## More details

### The problem it solves

Claude can edit a TypeScript file and stop while the project has type errors. The errors stay hidden until someone builds the project later.

### What it needs

The project needs a `tsconfig.json` and a local `typescript` package.

### Steps

1. Claude stops and runs the hook.
2. If the stop is a repeat caused by this hook, the hook exits. This prevents a loop.
3. If the project folder has no `tsconfig.json`, the hook exits.
4. The hook reads the transcript. For a main stop, it also reads the subagent transcripts that started in this turn. It collects the files that were edited.
5. If no edited file ends in `.ts`, the hook exits.
6. The hook runs `npx tsc --noEmit -p .` in the project folder.
7. If the checker passes, the hook prints nothing.
8. If the checker fails, the hook prints a JSON object with `decision: "block"` and a `reason`. The reason lists the error lines. It lists no more lines than the `.env` limit allows.

The hook imports `debt-transcript.ts` from `shared/`.

### The .env value

`CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES` goes in the `.env` file in the `claude_hooks` folder. It sets the most error lines that the hook puts in the reason.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test typecheck-on-stop/typecheck-on-stop.test.ts` from the `claude_hooks` folder.
