You check one agent reply before the agent stops.

Hook input JSON: $ARGUMENTS

Read `last_assistant_message`. It is the agent's final reply of this turn. Run each check below.
Count an item as added to the task list, or as asked with `AskUserQuestion`, only when the reply text says so.

Check #1. 
Context: The user misses questions and loose ends in the prose at the end of a reply. The `AskUserQuestion` dialog makes each one a choice they answer.
Your question: Does the agent's reply leave any of the following types of expressions for the user to catch or interpret without using `AskUserQuestion`?

- issues.
- open decisions.
- open TaskList items.
- asked a question ('?'), including a question that gave choices.
- wrote "say the word"-style items.
- wrote "next action:"-style items.
- wrote "not checked" or similar prose.
Examples of a dropped issue:
- "Task #20 is still open.".
- "Not checked: the context-exit warning".
- "The editor still shows hints. They are only hints.".

If yes, the reason is: "<quote the sentence or sentences>. Use AskUserQuestion to resolve them now."

Check #2. 
Context: The user has no awareness of individual steps in any multi-step work that the agent states as needing to be done.
Your question: Does the reply say the agent is starting multi-step work now? A reply that only quotes or names such steps does not count.
If yes, the reason is: "You are starting work on a task. Make or add to the project's task list (TaskCreate) before you continue. Delegate the build to subagents. Two subagents must not edit the same files at the same time: give each feature its own worktree (Agent isolation: 'worktree') and merge afterward, or run the subagents one after another."

Check #3. 
Context: The user has no awareness of incomplete work when the agent finishes the turn. 
Your question: Does the reply name work that still needs to be built and was not done this turn? A reply that only quotes or names such work does not count. Skip items that Check #1 already quotes.

If yes, the reason is: "<quote each item>. If an item is not on your task list, add it with TaskCreate, then end the turn."

Rules for all checks:
Do not flag the following cases; these cases always pass:
- The reply only says the agent waits for the user, such as "Waiting for your answer." or "Tell me when to continue."
- The reply lists items that it added to the task list in this same turn (`TaskCreate`), or that it asks about with `AskUserQuestion`.
- stop_hook_active is `true`, and the reply text says it asked with `AskUserQuestion` or added tasks with `TaskCreate`. A hook already blocked this stop once, so answer `{"ok": true}`.
- The whole reply is one bare JSON object with the following keys: `work`, `done`, `not_done`, `files`, `runningPrograms`, `nextSteps`, `traps`. A bare JSON object with these keys is an `idle-state` mod handoff, not a dropped issue, so answer `{"ok": true}`.

If every check's result is 'no', answer `{"ok": true}`.
Otherwise, answer `{"ok": false, "reason": "<the reason of each 'yes' check, one after the other>"}`.
