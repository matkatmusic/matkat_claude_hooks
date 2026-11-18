---
name: debt-ratchet
description: Scan every file in the current git repo with the debt-ratchet and comment hook code, and write the style debt log. Use when the user says "/debt-ratchet" or "write the style debt log".
---

# debt-ratchet

This skill scans every .ts, .html, and .css file in this git repo. It uses the code of the debt-ratchet hook and the comment hooks. It writes the style debt log.

## Steps
1. Use the Bash tool with `timeout: 600000`. Run `bun "${CLAUDE_SKILL_DIR}/../../debt-ratchet/debt-ratchet-report.ts"` from the repo root. Do not run it in the background.
2. Tell the user the total and the log path from the command output.
3. Tell the user that the scan ran eslint --fix and joined wrapped comments. These changes are in the files now. Tell the user to check them with `git diff`.
4. Tell the user to run `/clear-debt-ratchet` to fix the debt in the log.

## Rules
- Do not fix the debt in this skill.
- If the command failed, show the error. Do not run the command again.
