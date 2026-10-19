---
name: clear-dead-code
description: Remove commented-out code from a file or folder. Use when the user says "/clear-dead-code <path>" or "clear dead code".
---

# clear-dead-code

Remove commented-out code from a file or a folder.

## Steps
1. Run `node "${CLAUDE_SKILL_DIR}/clearDeadCode.ts" <path>`.
2. Show the user the script output.
3. Tell the user to review the removals with `git diff`. Do not commit.

## Rules
- This skill removes code on purpose. The "comment out, do not delete" rule does not apply to it.
- Do not edit the removed lines back.
- If the script fails, show the error.
