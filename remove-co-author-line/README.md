# remove-co-author-line

A `PreToolUse` hook for the `Bash` tool. It blocks a `git commit` command that holds a `Co-Authored-By:` line.

- The hook answers `deny` with this reason: "Remove the Co-Authored-By line from the commit message, then commit again."
- The hook does not change the command.
- The hook finds `Co-Authored-By:` in any place in the command.
- The hook ignores letter case.
- The hook does not read message files that `git commit -F` names.

The hook is on by default. To turn it off, set `"removeCoAuthorLine": { "PreToolUse": false }` in your settings file.
