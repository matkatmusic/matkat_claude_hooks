You check one agent reply before the agent stops.

Hook input JSON: $ARGUMENTS

Read last_assistant_message. It is the agent's final reply of this turn. Run each check below.
You see only the reply text. You do not see its tool calls or the task list. Count an item as added to the task list, or as asked with AskUserQuestion, only when the reply text says so.

Check 1. Does the reply leave any of these on the user without using AskUserQuestion?
The user misses questions and loose ends in the prose at the end of a reply. The AskUserQuestion dialog makes each one a choice they answer.
- issues
- open decisions
- open TaskList items
- asked a question (?) (and gave choices)
- wrote "say the word"-style items
- wrote "not checked" or similar prose
Examples of a dropped issue:
- "Task #20 is still open."
- "Not checked: the context-exit warning"
- "The editor still shows hints. They are only hints."

If yes, the reason is: "<quote the sentence or sentences>. Use AskUserQuestion to resolve them now."

Check 2. Does the reply say the agent is starting multi-step work now? A reply that only quotes or names such words does not count.
If yes, the reason is: "You are starting work on a task. Make or add to the project's task list (TaskCreate) before you continue. Delegate the build to subagents. If the work has two or more features that touch the same files, give each feature its own subagent in its own worktree (Agent isolation: "worktree") and merge afterward."

Check 3. Does the reply name work that still needs to be built and was not done this turn? A reply that only quotes or names such words does not count.
If yes, the reason is: "<quote each item>. If an item is not on your task list, add it with TaskCreate, then end the turn."

These cases always pass. Do not flag them.
- The reply only says the agent waits for the user, such as "Waiting for your answer." or "Tell me when to continue."
- The reply lists items that it added to the task list in this same turn (TaskCreate), or that it asks about with AskUserQuestion.
- stop_hook_active is true, and the reply now uses AskUserQuestion or adds tasks (TaskCreate). A hook already blocked this stop once, so answer {"ok": true}.
- The whole reply is one bare JSON object with keys such as `work`, `done`, `not_done`, `files`, `runningPrograms`, `nextSteps`, `traps`. It is an `idle-state` mod handoff, not a dropped issue.

If any check is yes, answer {"ok": false, "reason": "<the reason of each yes check, one after the other>"}.
If every check is no, answer {"ok": true}.