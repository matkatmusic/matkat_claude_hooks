# nudge-task-list

It blocks the end of a reply that says work is starting, and tells Claude to make a task list and to use subagents for the build.

A task list keeps a long job in order, and the hook reminds Claude to make one at the moment work begins.

## Install

Set `enabled: true` on this entry in `dispatcher/hooks-list.ts`:

```ts
{ event: "Stop", command: ["node", `${import.meta.dirname}/../nudge-task-list/nudge-task-list.ts`], enabled: true },
```

## How it works

When Claude stops, the hook reads the last reply and looks for phrases such as "starting on" or "fanning out". If it finds one, it blocks the stop. The reason tells Claude to add the work to the task list and to delegate the build to subagents. If `CLAUDE_CODE_TASK_LIST_ID` is not set, the reason also carries the setup help.

## More details

### The problem it solves

Claude can start a big job and forget to track it. Then the steps get lost. Work on the same files can also clash when many parts run at once.

### Why subagents

Subagents in their own worktrees keep parallel work apart. The nudge tells Claude to give each feature its own subagent in its own worktree when two or more features touch the same files, and to merge afterward.

### Steps

1. Claude stops its reply and runs the hook.
2. The hook looks for phrases such as "things to do", "starting on", "starting with", and "fanning out".
3. If it finds no phrase, the hook prints nothing.
4. If it finds a phrase, the hook prints a JSON object with `decision: "block"` and a `reason`. The reason is the nudge text.
5. If `CLAUDE_CODE_TASK_LIST_ID` is not set, the hook calls `checkTaskListId` from `shared/task-list-id.ts`. It adds the setup help to the reason.

### The .env value

The hook needs no `.env` value.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test nudge-task-list/nudge-task-list.test.ts` from the `claude_hooks` folder.
