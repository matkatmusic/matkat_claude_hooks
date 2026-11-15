# prune-shared-tasklist

This skill closes pending tasks of the shared task list that are duplicates, already done, or not needed. Each agent proves its reason first.

Type `/prune-shared-tasklist` to start it.

## Files

- `SKILL.md`: the skill file. It runs `SkillBodyEmitter.ts` and shows the output to Claude.
- `SkillBodyEmitter.ts`: it prints the steps with the Workflow input as one JSON block, then the instructions for Claude.
- `pruneSharedTasklist.workflow.js`: the Workflow script. It proposes the tasks to close, then closes each one. Its result holds a ready `report` text.
- `listTasksClosedByRun.ts`: it lists the tasks that one run closed, with their status. Claude runs it after the workflow.
- `listTasksClosedByPruning.ts`: it lists the tasks that every prune run closed, with status, `closedBy`, and reason. Claude runs it after the workflow.
- `SkillBodyEmitter.test.ts`: the tests for the emitter.
- `listTasksClosedByRun.test.ts`: the tests for the first list script.
- `listTasksClosedByPruning.test.ts`: the tests for the second list script.
- `pruneSharedTasklist.workflow.test.ts`: the tests for the Workflow script. They run it with stub agents.

## Scope

- The run closes duplicates, tasks that are already done, and tasks that are not needed.
- It closes them without asking.
- A task with no proof stays open. A task with no proposal also stays open.
- The proof sources are git, code, stored memory, and chat logs of the last 14 days.
- The run marks tasks completed. It never deletes tasks.
- Each closed task gets the metadata `closedReason`, `closedEvidence`, and `closedBy`.
- The task that tracks a prune run stays open, because it has no proof.

## Known limits

- Subagents of the Agent tool have no TaskGet tool and no TaskUpdate tool. The closing step stays inside the Workflow.
- The run reads tasks that are in progress to find duplicates. It never closes them.

## Check what SkillBodyEmitter prints

Run each command from the root folder of the project you want to check.

### A project with a shared task list

```sh
CLAUDE_CODE_TASK_LIST_ID=<task list name> bun <path to claude_hooks>/skills/prune-shared-tasklist/SkillBodyEmitter.ts
```

The output has two parts.

1. The steps. Item 1 holds the real pending count. Under item 2 is a JSON block with only `scriptPath` and `args`. The `args` object holds `taskFolder`, `memoryFile`, `transcriptFolder`, `repoFolders`, `closedBy`, and `taskIds`. The block is the exact input of the Workflow tool.
2. The instruction text. It holds the real paths of the two list scripts and the real task folder path.

A chat that already has the variable needs no prefix. To see the value, run `echo $CLAUDE_CODE_TASK_LIST_ID`.

### A project with no shared task list

```sh
env -u CLAUDE_CODE_TASK_LIST_ID bun <path to claude_hooks>/skills/prune-shared-tasklist/SkillBodyEmitter.ts
```

The output is one sentence: the task list id is not set. It has no JSON and no instructions.

### A task list with no pending task

The output is one sentence: `No pending tasks.` It has no JSON and no instructions.

### A task list name with no folder

If the variable names a list whose folder `~/.claude/tasks/<name>` does not exist, the emitter throws an `ENOENT` error. It prints no skill body.

## Test

Run `node --test skills/prune-shared-tasklist/SkillBodyEmitter.test.ts skills/prune-shared-tasklist/listTasksClosedByRun.test.ts skills/prune-shared-tasklist/listTasksClosedByPruning.test.ts skills/prune-shared-tasklist/pruneSharedTasklist.workflow.test.ts` from the `claude_hooks` folder.
