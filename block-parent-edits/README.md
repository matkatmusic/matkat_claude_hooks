# block-parent-edits

## What it does

It runs before every Edit, Write, NotebookEdit, and Bash tool call. If the main session runs a Fable model or an Opus 5 model, the hook blocks file edits. The hook tells the model to give the edit to a subagent. Subagents may edit. The hook does not block edits in plan mode.

For Bash, the hook blocks only commands that change files. It blocks redirects to a file, heredocs, `cp`, `mv`, `rm`, `mkdir`, `touch`, `chmod`, `sd`, `sed -i`, `tee`, and `-o <file>` flags. It lets `ls`, `rg -o`, `grep -o`, and `>/dev/null` pass.

The hook also blocks a subagent when the variable `CLAUDE_CODE_SUBAGENT_MODEL` names a Fable model.

## The problem it solves

Big models cost more than small models. A big model that edits files itself wastes money on simple work. A small subagent does the same edit for less.

## Why it was made

The rule "the main session must not edit" was only text in a prompt. The model forgot it. A hook enforces the rule every time.

## How it works

1. Claude calls a tool. The hook reads the call from stdin.
2. The hook finds out if the call comes from a subagent.
3. For the main session, the hook reads the last model name in the transcript.
4. If the model starts with `claude-fable` or `claude-opus-5`, and the session is not in plan mode, the hook checks the tool.
5. Edit, Write, and NotebookEdit are blocked. A Bash call is blocked only when it writes files.
6. The hook saves the blocked tool input as a JSON file in the folder named by `CLAUDE_HOOKS_BLOCKED_EDITS_DIR`.
7. The hook prints a deny decision. The message names the saved file, so the subagent can read it and apply the edit.

## The .env value

`CLAUDE_HOOKS_BLOCKED_EDITS_DIR` is the folder where the hook saves blocked tool calls. Add it to your `.env` file. Example: `CLAUDE_HOOKS_BLOCKED_EDITS_DIR=/tmp/claude-blocked-edits`.

## Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

## Turn it on through the dispatcher

Add this entry to the list file that `CLAUDE_HOOKS_LIST` points to:

```ts
{ event: "PreToolUse", matcher: "Edit|Write|NotebookEdit|Bash", command: ["node", "/path/to/claude_hooks/block-parent-edits/block-parent-edits.ts"], enabled: true },
```

Do not use both ways at the same time. The hook would run twice.

## Test

Run `node --test block-parent-edits/block-parent-edits.test.ts` from the `claude_hooks` folder.
