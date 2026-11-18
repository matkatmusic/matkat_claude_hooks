---
name: clear-debt-ratchet
description: Fix every item in the style debt log that /debt-ratchet wrote. Spawns one helper per file. Use when the user says "/clear-debt-ratchet", "/clear-debt-ratchet <max helpers>", or "clear the style debt log".
---

# clear-debt-ratchet

Command text: $ARGUMENTS

The first word of the command text is the max number of helpers that run at the same time. If there is no number, use 4.

## Steps
1. Run `bun "${CLAUDE_SKILL_DIR}/../../skills/clear-debt-ratchet/orderDebtFixes.ts"` from the repo root. It prints JSON with `logPath`, `maxFileLines`, `splitFiles`, and `fixFiles`. If it fails because the log file is missing, tell the user to run `/debt-ratchet` first, and stop.
2. Split the files in `splitFiles`. Use one helper for each file, one helper at a time. A split changes the files that import the split file, so two splits must not run at the same time. Wait for each helper's report before you start the next helper. Give each helper this job:
   - Split `<path>` into files that each have fewer than `<maxFileLines>` lines.
   - Update every import of the moved code. Find the imports with `rg`.
   - Move or split the tests so that each new file has a test file.
   - Run the full test suite. Fix the failures that the split caused.
   - Do not commit and do not stage.
3. Run `bun "${CLAUDE_SKILL_DIR}/../../debt-ratchet/debtRatchetReport.ts"` to write the log again. The splits made new files. Then run the command of step 1 again to get the new `fixFiles`.
4. Fix the files in `fixFiles`. Use one helper for each file. Do not run more helpers at the same time than the max number. When a helper finishes, start the next one. Give each helper this job:
   - Read `details["<path>"]` in `<logPath>`. It holds `eslintLines`, `longCommentLines`, and `missingTest`.
   - To see the eslint messages, run `"${CLAUDE_SKILL_DIR}/../../node_modules/.bin/eslint" --config "${CLAUDE_SKILL_DIR}/../../debt-ratchet/eslint.config.js" "<path>"`.
   - Fix each eslint message. Rewrite array calls as a `for()` loop with named booleans. Rename functions to start with a verb from `FUNCTION_VERBS` in `${CLAUDE_SKILL_DIR}/../../debt-ratchet/eslint.config.js`. Edit only `<path>` and its test file. Do not rename an exported function. List each exported function that needs a new name in your report.
   - Rewrite each comment on a line in `longCommentLines` to fewer than 20 words, on one line.
   - If `missingTest` is true, write a test file next to the file, named `<name>.test.ts`.
   - Run the test file of `<path>`. Fix the failures that your changes caused.
   - Do not commit and do not stage.
5. Rename the exported functions that the helpers listed. Use one helper for each function, one helper at a time. Give each helper this job: rename the function to start with a verb from `FUNCTION_VERBS`, update every import (find them with `rg`), run the full test suite, fix the failures that the rename caused, do not commit and do not stage. If no helper listed a function, run the full test suite once and fix the failures.
6. Run `bun "${CLAUDE_SKILL_DIR}/../../debt-ratchet/debtRatchetReport.ts"` again. Tell the user the new total and the files that still have debt.

## Rules
- Give the user one status update after all helpers finish. Do not report each helper as it finishes.
- Do not commit. The user commits.
