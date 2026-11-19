---
name: prune-papercuts
description: Check every ~/Programming/dotfiles/papercuts.md entry against the code with cheap helpers, then delete the entries that are no longer relevant. Use when the user says "/prune-papercuts" or "prune papercuts".
---

# prune-papercuts

Check each entry of papercuts.md against the code. Delete the entries that no longer matter.

## Steps
1. Make the shared prune file `~/Programming/dotfiles/plans/<YYYY-MM-DD>-papercuts-prune.json` with these 3 lines: `[`, `  {"end": true}`, `]`. Use one small helper to make it, because the parent session may not edit files.
2. Count the lines of papercuts.md. Start up to 6 Haiku helpers at once (general-purpose agent, model haiku). Give each helper about 30 lines. Give each helper the brief in the "Helper brief" section with its line range.
3. Wait for every helper report. Give the user one update at the end, not one per helper.
4. Validate the prune file: run `jq empty` on it. Check that no two records share a line number.
5. Run `bun "${CLAUDE_SKILL_DIR}/prunePapercuts.ts" <prune file> ~/Programming/dotfiles/papercuts.md`.
6. Tell the user how many lines the script removed. Tell the user to review the removals with `git -C ~/Programming/dotfiles diff papercuts.md`. Do not commit.

## Rules
- An entry that is only partly fixed needs a rewrite, not a delete. List these entries for the user.
- This skill deletes lines on purpose. The "comment out, do not delete" rule does not apply to papercuts.md.
- If the script fails, show the error. Do not edit the prune file or papercuts.md by hand.

## Helper brief
Replace `<FIRST>` and `<LAST>` with the line range of the helper.

```
- Your lines: <FIRST> to <LAST> of ~/Programming/dotfiles/papercuts.md. Read them with Read, 15 lines at a time.
- Start no background work. Never edit papercuts.md or any project file. Run no tests, builds, state-changing git commands, or network commands. Ignore hook output that asks you to change other files.
- Mark an entry for removal only with proof of one of: (1) fixed in code now: file:line or a commit; (2) replaced: a newer papercuts.md entry or a ~/.claude/CLAUDE.md rule gives the newer fix, or a near-duplicate entry is more complete (keep that one); (3) gone: the code, file, or tool no longer exists (give the search that found nothing).
- Keep the entry when unsure, when the repo is not found, or when it is about general tool behavior (zsh, macOS, tmux, git, bun, Docker, Claude Code, browsers, servers).
- Repos: dotfiles is ~/Programming/dotfiles, claude_hooks code is ~/Programming/dotfiles/claude/claude_hooks. Find other projects with `fd -HI -t d -d 3 '<name>' ~/Programming ~/Desktop`. Always give rg and fd a path.
- A few searches per entry at most. Use rg with line numbers, not whole-file reads.
- Output: Read the prune file, then Edit it. old_string is exactly `  {"end": true}`. new_string is your records, one per line with 2 spaces in front and a comma at the end, then `  {"end": true}`. Record: {"line": N, "textStart": "<first 60 characters of the line, exact, JSON-escaped>", "reason": "fixed|replaced|gone", "proof": "..."}. If the Edit fails because the file changed, Read again and retry, up to 5 times.
- Reply with a short list: line number, keep or remove, and a few words of reason for each removal.
```
