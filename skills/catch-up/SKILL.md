---
name: catch-up
description: Catch the user up on recent work from the .idleState reports. Use when the user says "/catch-up" or "catch me up".
---

# catch-up

Read the state files of past chats. Show the user what is still open.

## Steps
1. Find the project root. Run `node "${CLAUDE_SKILL_DIR}/collect.ts" <project root>`. The output is one JSON object with 5 lists: `not_done`, `actions`, `questions`, `rules`, `mistakes`. Each item has `text` and `file`.
2. Start one subagent with `model: haiku`. Give it the 5 lists. It does these steps in order:
   a. In each list, it merges items that say the same thing in different words. It keeps the newest `file` value of each merged item.
   b. It checks only `not_done`, `actions`, and `questions`. It does not check `rules` or `mistakes`. For each checked item, it looks at `git log` and the working tree since the stamp in the `file` value. The stamp is the `YYYY-MM-DD-HHMM` at the start. It drops each item that is done.
   c. It runs `node "${CLAUDE_SKILL_DIR}/removeItem.ts" "<text1>" "<file1>" "<text2>" "<file2>" ...` one time from the project root, with every dropped item.
   d. It returns the 5 lists with the items that are left.
3. Show the user the items that are left. Show `rules` and `mistakes` first, in full. Then show `not_done`, `actions`, and `questions`.
4. Call TaskList. For each `not_done` item that no open task covers, make a task.

## Rules
- Do not ask the user anything in this skill. A Stop hook turns the shown items into questions.
- Do not change the text of an item, except when you merge items.
- If `collect.ts` fails, show the error. Do not guess the lists.
