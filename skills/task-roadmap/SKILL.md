---
name: task-roadmap
description: Build or update the roadmap file of the open tasks in the shared task list: plans/<list>-roadmap.json. Use when the user says "/task-roadmap", "/task-roadmap full", or "make a task roadmap".
allowed-tools: Bash(bun *)
---

Command text: $ARGUMENTS

```!
bun "${CLAUDE_PLUGIN_ROOT}/skills/task-roadmap/SkillBodyEmitter.ts"
```
