# committed-task-check

It blocks the end of a reply when new git commits exist, and tells Claude to mark the matching open tasks as completed.

Claude makes tasks and the work gets committed, but nobody marks the task completed. The shared task list then grows. This hook asks for the mark at the moment a commit appears.

## Install

Set this entry to `true` in `dispatcher/user-dispatch.json`. The default is in `dispatcher/dispatch.json`.

```json
{ "enablements": { "committed-task-check": { "Stop": true } } }
```

## How it works

When Claude stops, the hook lists the commits made since it last looked. It reads the repo at `cwd` and each of its submodules, on all branches. If there are new commits and open tasks, it blocks the stop. The reason lists the commits (hash, title, changed files) and the open tasks (pending and in progress). It tells Claude to mark a task completed with TaskUpdate only when a listed commit clearly holds that task's work. The task list is shared by all chats, so Claude must leave a task alone when unsure.

## More details

### The problem it solves

Agents make tasks. The work is committed by the agent or by the user. The task stays open. Over time the shared list fills with finished work.

### The last look marker

The hook stores `lastCommitCheckSeconds` in the session state file. The file is in the folder named by `CLAUDE_HOOKS_SESSION_STATE_DIR` in `input.settings`, and is named for `session_id`. The value is a Unix time in whole seconds.

- With no marker, the hook uses the birth time of the `transcript_path` file. A commit made in the first turn is caught.
- The marker moves only when there are new commits. It moves to the next whole second, so a reported commit is not reported again.
- A stop with `stop_hook_active` set to true passes and does not move the marker.

### Roadmap

The `/task-roadmap` skill writes a roadmap file at `<repo top-level folder>/plans/<CLAUDE_CODE_TASK_LIST_ID>-roadmap.json`. When that file exists, the block reason also holds a ready command. Claude runs it after each TaskUpdate that marks a task completed:

```
bun markRoadmapTaskCompleted.ts <roadmap file> <task number>
```

The script sets `completed` on the element of that task to the current UTC time (`YYYY-MM-DDTHH:MM:SSZ`). It edits only that value on the element's line, so all other bytes stay the same. It prints one line. It changes nothing in these three cases, prints one line that says so, and exits with code 0:

1. The roadmap file does not exist.
2. No element has that task number.
3. The element already has a `completed` value.

When the roadmap file does not exist, the block reason has no roadmap command.

### Steps

1. The hook reads `cwd`, `session_id`, `transcript_path`, and `stop_hook_active` from the Stop payload.
2. If `stop_hook_active` is true, the hook prints nothing.
3. If `CLAUDE_CODE_TASK_LIST_ID` is not set, the hook prints nothing.
4. If `cwd` is not in a git repo, the hook prints nothing.
5. The hook lists new commits in the repo and each submodule. If there are none, it prints nothing.
6. The hook moves the marker.
7. If there are no pending or in progress tasks, the hook prints nothing.
8. Otherwise the hook prints a JSON object with `decision: "block"` and the `reason`.

### The settings values

The hook needs only `CLAUDE_HOOKS_SESSION_STATE_DIR`, from the `shared` entry in `dispatcher/dispatch.json`.

### Turn it on alone

Copy the block from `hooks.json` into your `settings.json`. Change `/path/to/claude_hooks` to the real folder on your computer. The hook needs `settings.CLAUDE_HOOKS_SESSION_STATE_DIR` in its input, so run it through the dispatcher.

Do not use both ways at the same time. The hook would run twice.

### Test

Run `node --test committed-task-check/committed-task-check.test.ts committed-task-check/markRoadmapTaskCompleted.test.ts` from the `claude_hooks` folder.
