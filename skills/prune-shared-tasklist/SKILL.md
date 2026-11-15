---
name: prune-shared-tasklist
description: Close pending tasks of the shared task list that are duplicates, already done, or not needed, and prove each reason first. Use when the user says "/prune-shared-tasklist" or "prune the task list".
allowed-tools: Bash(bun *)
---

```!
bun "${CLAUDE_PLUGIN_ROOT}/skills/prune-shared-tasklist/SkillBodyEmitter.ts"
```
