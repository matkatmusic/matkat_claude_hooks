---
name: handoff-state
description: Write the idle-state handoff JSON for this chat so a fresh chat can continue. Use when the user says "/handoff-state" or "hand off this session".
---

# handoff-state

Write a state file for this chat. A fresh chat reads it and continues the work.

## Steps
1. Find the project root. Find the current git branch.
2. Find the folder name. Read `CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME` from the environment. If it is not set, use `.idleState`.
3. Find the stamp. Use the local time, in the form `YYYY-MM-DD-HHMM`.
4. Find the session id. Use its first 8 characters.
5. Make the JSON object that describes this chat. Read the template from `../../shared/idle-state-template.json`, then fill it.
6. Use the Write tool. Write the JSON to `<project root>/<folder name>/<stamp>-<session id 8>.json`.
7. Write `*` and a newline to `<project root>/<folder name>/.gitignore`. Git then ignores the state files.
8. Reply with only the file path.

## Rules
- Write only JSON in the file. Do not use a code fence.
- Replace each example value in the template with a real value.
- Use an empty array when there is nothing to say.
- For `runningPrograms`, give the exact command line that started each program.
- Keep each section under 150 words.
- Do not use other tools to write the file.
