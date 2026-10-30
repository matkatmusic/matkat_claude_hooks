---
name: catch-up
description: Catch the user up on recent work from the .idleState reports. Use when the user says "/catch-up" or "catch me up".
allowed-tools: Bash(bun *)
---

```!
bun "${CLAUDE_PLUGIN_ROOT}/skills/catch-up/SkillBodyEmitter.ts"
```
