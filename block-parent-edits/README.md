# block-parent-edits

It blocks file edits from the main session when the main model is Fable or Opus 5, and tells the model to give the edit to a subagent.

A big model that edits files itself wastes money on simple work, and a small subagent does the same edit for less.

## Install

1. Set this value in `.env`. Example: `CLAUDE_HOOKS_BLOCKED_EDITS_DIR=/tmp/claude-blocked-edits`.

```sh
CLAUDE_HOOKS_BLOCKED_EDITS_DIR=/path/to/blocked-edits
```

2. Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "PreToolUse", matcher: "Edit|Write|NotebookEdit|Bash", command: ["node", `${import.meta.dirname}/../block-parent-edits/block-parent-edits.ts`], enabled: true },
```

## How it works

The hook runs before every Edit, Write, NotebookEdit, and Bash call. It finds out if the call comes from a subagent. For the main session, it reads the last model name in the transcript. If the model is Fable or Opus 5, it denies the edit. It saves the blocked tool input as a JSON file and names that file in the message, so the subagent can apply the edit.

## More details

### What it blocks

If the main session runs a Fable model or an Opus 5 model, the hook blocks file edits. Subagents may edit. The hook does not block edits in plan mode.

For Bash, the hook blocks only commands that change files. It blocks redirects to a file, heredocs, `cp`, `mv`, `rm`, `mkdir`, `touch`, `chmod`, `sd`, `sed -i`, `tee`, and `-o <file>` flags. It lets `ls`, `rg -o`, `grep -o`, and `>/dev/null` pass.

Writes under a `.idleState/` folder always pass, so the handoff-state skill can save its file.

The hook also blocks a subagent when the variable `CLAUDE_CODE_SUBAGENT_MODEL` names a Fable model. The message tells you to change that variable in the global `settings.json`.

### The problem it solves

Big models cost more than small models. A big model that edits files itself wastes money on simple work. A small subagent does the same edit for less.

### When it acts

It acts on the main session only when the main model is Fable or Opus 5.

### Why it was made

The rule "the main session must not edit" was only text in a prompt. The model forgot it. A hook enforces the rule every time.

### Steps

1. Claude calls a tool. The hook reads the call from stdin.
2. The hook finds out if the call comes from a subagent.
3. For the main session, the hook reads the last model name in the transcript.
4. If the model starts with `claude-fable` or is `claude-opus-5` or a later Opus, and the session is not in plan mode, the hook checks the tool.
5. Edit, Write, and NotebookEdit are blocked. A Bash call is blocked only when it writes files.
6. The hook saves the blocked tool input as a JSON file in the folder named by `CLAUDE_HOOKS_BLOCKED_EDITS_DIR`.
7. The hook prints a deny decision. The message names the saved file, so the subagent can read it and apply the edit.

### The .env value

`CLAUDE_HOOKS_BLOCKED_EDITS_DIR` is the folder where the hook saves blocked tool calls. Add it to your `.env` file.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test block-parent-edits/block-parent-edits.test.ts` from the `claude_hooks` folder.
