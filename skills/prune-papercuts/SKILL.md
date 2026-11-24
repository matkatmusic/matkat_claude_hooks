---
name: prune-papercuts
description: Check every entry of the current project's .claude/papercuts.md against the code with cheap helpers, then delete the entries that are no longer relevant. Use when the user says "/prune-papercuts" or "prune papercuts".
allowed-tools: Bash(bun *)
---

```!
bun "${CLAUDE_PLUGIN_ROOT}/skills/prune-papercuts/SkillBodyEmitter.ts"
```
