# block-bash-edits

It stops Claude from writing file content with Bash commands and tells it to use the Edit or Write tools instead.

Your style and debt checks must see every file change, and they watch only the Edit and Write tools.

## Install

Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "PreToolUse", matcher: "Bash", command: ["node", `${import.meta.dirname}/../block-bash-edits/block-bash-edits.ts`], enabled: true },
```

## How it works

The hook runs before every Bash tool call. It asks `isBashContentWrite` if the command writes file content. If yes, it denies the call and tells Claude to use Edit or Write. If no, it prints nothing and the command runs.

## More details

### The problem it solves

Claude sometimes writes files with `cat >`, heredocs, `sed -i`, `tee`, or `python -c`. Other hooks only watch the Edit and Write tools. A file written with Bash skips those hooks. This hook closes that gap.

### Steps

1. The hook runs before every Bash tool call.
2. It reads the command and asks `isBashContentWrite` (from `shared/bash-content-write.ts`) if the command writes file content.
3. If yes, it denies the call and tells Claude to use Edit or Write.
4. If no, it prints nothing and the command runs.

Commands like `rm`, `mv`, `mkdir`, `ls 2>&1`, and `cmd > /dev/null` are allowed.

### The .env values

The hook needs no `.env` values.

### Turn it on alone

Paste the block from `hooks.json` into your `settings.json`. Replace `/path/to/claude_hooks` with the real path on your computer.

Do not use both ways at the same time. The hook would run twice.
