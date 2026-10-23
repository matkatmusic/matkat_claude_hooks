# Route table: topic x action

Replaced by typesafe-checker-2.mmd. Do not use.

Codes: `-` do not block, `ASK` block with AskUserQuestion, `TASK` block with TaskCreate, `WHO`, `ASKED`, `LISTED`.

## 1. Grid

| topic \ action | FACT | QUESTION | OFFER | CHOICES | DECISION | ANSWER | INSTRUCTION | GUESS |
|---|---|---|---|---|---|---|---|---|
| WORK          | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| CHECK         | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| CODE          | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| DECISION      | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| HELPER        | WHO | ASK | ASK | ASK | - | - | ASKED | ASK |
| TASK_LIST     | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| PLAN          | WHO | ASK | ASK | ASK | - | - | ASKED | ASK |
| OTHER_SESSION | -   | ASK | ASK | ASK | - | - | ASKED | ASK |
| BUG           | WHO | ASK | ASK | ASK | - | - | ASKED | ASK |

## 2. Cells that differ from today's default (default FACT = WHO)

- WORK + FACT -> `-`: a fact about work needs no owner or time check (evidence: user's own example; s1-142-143, s2-phase2-running-now)
- CHECK + FACT -> `-`: a check result is only a report (evidence: describesStateChecked; s2-older-commit, s2-unlabeled-readuser-copies)
- CODE + FACT -> `-`: facts about code state and today's behavior owe nothing (evidence: describesStateOfCode, describesCurrentBehavior; s2-unlabeled-two-calls)
- DECISION + FACT -> `-`: a plain fact about a question or decision owes no work (evidence: s2-unlabeled-two-calls)
- TASK_LIST + FACT -> `-`: work named on the task list is already tracked (evidence: describesCreatingTasks, describesSpecificTask; s1-142-143)
- OTHER_SESSION + FACT -> `-`: a report from another session is only news (evidence: describesSessionInformation; s1-unlabeled-rules-file)

Cells kept at the default WHO (listed so the intent is clear):
- HELPER + FACT -> WHO: a helper may be doing the work, or Claude may owe a follow-up (evidence: describesWaitingForSubagent; s1-143-stays-open)
- PLAN + FACT -> WHO: plan steps are work that Claude still owes (evidence: describesStepInMultistepWork; s2-next-phases)
- BUG + FACT -> WHO: a found bug is owed work, so check owner and task list (evidence: describesIssue; s2-old-behavior-back)

All other columns (QUESTION, OFFER, CHOICES, DECISION, ANSWER, INSTRUCTION, GUESS) match today's default for every topic.

## 3. Unsure cells

- WORK + FACT: `-` or `WHO`. The user's rule says `-`, but "I started phase 1, steps follow" (s2-next-phases) and "not done" lines would then pass. Check #2 of the current rules prompt would be lost.
- WORK + FACT: `-` or `LISTED`. Lines such as "Not done: ..." and "Task #20 is still open" (describesWorkNotDone) are owed work that the user wants caught.
- PLAN + FACT: `WHO` or `-`. Many plan lines are proposals (s2-unlabeled-five-changes-a, -b) and may belong under OFFER instead.
- HELPER + FACT: `WHO` or `-`. A running helper usually passes anyway (s1-helper-still-running, s2-unlabeled-task-list-1585).
- TASK_LIST + FACT: `-` or `LISTED`. The rules prompt names "open TaskList items" as a dropped issue (Task #20 example).
- DECISION + FACT: `-` or `ASK`. A fact like "this decision is still open" leaves a decision for the user (describesOpenDecision-style lines).
- OTHER_SESSION + FACT: `-` or `WHO`. "Not ready to tell the other session yet" (s2-unlabeled-five-changes-a) is owed work.
- WORK + DECISION: `-` or `WHO`. A user decision such as "all three fixes" (s2-unlabeled-task-list-1585) hands Claude new work.
- PLAN + DECISION: `-` or `WHO`. Same reason: a chosen plan is owed work.
- BUG + GUESS: `ASK` or `WHO`. A guessed cause of a bug is also an open problem (s2-i-think-it-passed shape).
- BUG + ANSWER: `-` or `WHO`. A confirmed answer can still say the bug stays unfixed.
