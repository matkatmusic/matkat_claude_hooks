# ask-dont-dump-issues

## What it does

It runs when Claude stops its reply. It blocks the stop once per reply. It tells Claude to ask the user with AskUserQuestion about every open item. If there are no open items, Claude runs `turn-done.ts` and then ends the reply.

The folder holds three files that work together:

- `ask-dont-dump-issues.ts` is the Stop hook.
- `turn-done.ts` is the command that Claude runs to say "no open items".
- `session-cleanup.ts` is the SessionEnd hook. It clears the saved marks when a session ends.

## The problem it solves

Claude can end a reply with a pile of issues, open choices, or lines such as "say the word". The user must then read the pile and type an answer. A better way is a short question with choices.

## Why it was made

A reply that ends with a dump hands the work back to the user. A question with choices is quick to answer. The hook forces Claude to ask the question instead of writing the dump.

## How it works

1. Claude stops its reply and runs the Stop hook.
2. The hook reads the session state file in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `.env`. It holds two times: `reminded` and `done`.
3. The hook blocks if it did not remind Claude since the last user prompt.
4. The hook blocks if the last reply has a phrase such as "if you want", "let me know", or "your call".
5. The hook blocks if the last reply has a question mark and two or more list lines.
6. The hook blocks if `done` is not newer than `reminded`.
7. When the hook blocks, it saves the time in `reminded`. It prints a JSON object with `decision: "block"`. The reason tells Claude to use AskUserQuestion, or to run `turn-done.ts` from this folder.
8. `turn-done.ts` saves the time in `done`. The next Stop passes if the last reply has no dump phrase.
9. When the session ends, `session-cleanup.ts` removes `done` and `reminded` from the state file.

## The .env value

The hook needs no `.env` value.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer. The block has two hooks: one for Stop and one for SessionEnd.

## Turn it on through the dispatcher

Add these entries to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "Stop", command: ["node", "/path/to/claude_hooks/ask-dont-dump-issues/ask-dont-dump-issues.ts"], enabled: true },
{ event: "SessionEnd", command: ["node", "/path/to/claude_hooks/ask-dont-dump-issues/session-cleanup.ts"], enabled: true },
```

Do not use both ways at the same time. The hooks would run twice.

## Test

Run `node --test ask-dont-dump-issues/ask-dont-dump-issues.test.ts` and `node --test ask-dont-dump-issues/session-cleanup.test.ts` from the `claude_hooks` folder.
