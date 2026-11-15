# prune-shared-tasklist

This skill closes pending tasks of the shared task list that are duplicates, already done, or not needed. Each agent proves its reason first.

Type `/prune-shared-tasklist` to start it.

## Files

- `SKILL.md`: the skill file. It runs `SkillBodyEmitter.ts` and shows the output to Claude.
- `SkillBodyEmitter.ts`: it prints the Workflow arguments as one JSON block, then the instructions for Claude.
- `pruneSharedTasklist.workflow.js`: the Workflow script. It proposes the tasks to close, then closes each one.
- `SkillBodyEmitter.test.ts`: the tests for the emitter.

## Check what SkillBodyEmitter prints

Run each command from the root folder of the project you want to check.

### A project with a shared task list

```sh
CLAUDE_CODE_TASK_LIST_ID=<task list name> bun <path to claude_hooks>/skills/prune-shared-tasklist/SkillBodyEmitter.ts
```

The output has two parts.

1. A JSON block with `scriptPath`, `pendingCount`, and `args`. The `args` object holds `taskFolder`, `memoryFile`, `transcriptFolder`, `repoFolders`, `closedBy`, and `taskIds`.
2. The instruction text. It holds the real script path and the real task folder path.

A chat that already has the variable needs no prefix. To see the value, run `echo $CLAUDE_CODE_TASK_LIST_ID`.

### A project with no shared task list

```sh
env -u CLAUDE_CODE_TASK_LIST_ID bun <path to claude_hooks>/skills/prune-shared-tasklist/SkillBodyEmitter.ts
```

The output is one sentence: the task list id is not set. It has no JSON and no instructions.

### A task list name with no folder

If the variable names a list whose folder `~/.claude/tasks/<name>` does not exist, the emitter throws an `ENOENT` error. It prints no skill body.

## Test

Run `node --test skills/prune-shared-tasklist/SkillBodyEmitter.test.ts` from the `claude_hooks` folder.
