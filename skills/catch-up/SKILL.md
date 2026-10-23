---
name: catch-up
description: Catch the user up on recent work from the .idleState reports. Use when the user says "/catch-up" or "catch me up".
---

# catch-up

Read the state files of past chats. Show the user what is still open.

## Steps
1. Find the project root. Run `node "${CLAUDE_SKILL_DIR}/collect.ts" <project root>`. The output is one JSON object with 5 lists: `not_done`, `actions`, `questions`, `rules`, `mistakes`. It also has a `files` list. Each item in the 5 lists has `text` and `file`. An item from a new state file also has `sessionId`.
2. Start one subagent with `model: haiku`. Give it the 5 lists, the `files` list, the project root, and your scratchpad folder. It does these steps in order:
   a. In each list, it merges items that say the same thing in different words. It keeps one wording of each merged item.
   When an item is not clear, the subagent may read the transcript of the chat that made it. The transcript is `~/.claude/projects/<project folder>/<sessionId>.jsonl`. The project folder name is the full path of the project root, with each character that is not a letter or a digit changed to `-`. Example: `/Users/x/Programming/dotfiles` becomes `-Users-x-Programming-dotfiles`. An item with no `sessionId` has no transcript.
   b. It checks only `not_done`, `actions`, and `questions` against git. For each checked item, it looks at `git log` and the working tree since the stamp in the `file` value. The stamp is the `YYYY-MM-DD-HHMM` at the start. It drops each item that is done.
   c. It reads `~/.claude/CLAUDE.md`, `<project root>/CLAUDE.md`, and each file in `~/.claude/projects/<project folder>/memory/`. It drops each `rules` or `mistakes` item that one of those files already says.
   d. It sorts each `rules` or `mistakes` item that is left. A lasting item holds for every chat in this project. A one-chat item names one chat's files, branch, or work. It drops each one-chat item.
   e. For each lasting item, it writes one memory file in `~/.claude/projects/<project folder>/memory/` with the Write tool. The file has frontmatter with `name`, `description`, and `metadata.type: feedback`, then the item text. It adds one line for the file to `MEMORY.md` in that folder.
   f. It writes one JSON file to `<scratchpad folder>/catch-up-merge.json` with the Write tool. The file has `not_done`, `actions`, and `questions` as lists of text only. `rules` and `mistakes` are empty lists. The file also has the `files` list from step 1 unchanged.
   g. It runs `node "${CLAUDE_SKILL_DIR}/writeMerged.ts" <scratchpad folder>/catch-up-merge.json` one time from the project root.
   h. It returns `not_done`, `actions`, and `questions` with the items that are left. It also returns the items it moved to memory, and the number of items it dropped in steps c and d.
3. Show the user the items that moved to memory, in full, and the number of dropped rules and mistakes. Then show `not_done`, `actions`, and `questions`.
4. Call TaskList. For each `not_done` or `actions` item that no open task covers, make a task. An `actions` item that only says to wait, or gives an order for one chat only, needs no task.

## Rules
- Do not ask the user anything in this skill. A Stop hook turns the shown items into questions.
- Do not change the text of an item.
- If `collect.ts` fails, show the error. Do not guess the lists.
