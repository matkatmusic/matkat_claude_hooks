## Proposed data-preparation algorithms

I recommend two separate diagrams because they serve different purposes:

- Extraction converts a reply into a collection of independently evaluable items without losing context.
- Normalization converts each extracted item into consistent structured data that the two decision trees can evaluate.

The diagrams below follow your parser conventions: standalone declarations, explicit `Q_CHOICE_` blocks, and no labeled edges.

## 1. Diagram A — Extract distinct items from reply

The extraction algorithm should work at the claim or obligation level, not strictly at the sentence level.

A sentence can contain multiple items, and multiple sentences can describe the same item. The extraction stage must therefore split compound statements and merge repeated references.

see @distinct-item-extraction.mmd

### Extraction rules

The important implementation details are:

1. Split compound statements: Separate claims that might independently trigger different actions.
2. Preserve source evidence: Store exact quoted spans or character offsets for traceability.
3. Resolve references: For example, "I'll fix it" must reference the previously mentioned bug.
4. Preserve modality: "I could fix it" is an offer, while "I will fix it" is a commitment.
5. Merge equivalent references: Two sentences discussing the same unresolved bug should not automatically produce two tasks.
6. Never discard distinct actions: Two different fixes for the same bug may require separate TaskList items.

This phase should remain relatively neutral. It should not decide whether an extracted candidate deserves AskUserQuestion or a TaskList entry.

## 2. Diagram B — Normalize each extracted item

Normalization gives the next decision trees a predictable representation.

It must capture both what an item is about and what the reply says about it.

see @normalize-extracted-item.mmd

## 3. Ask Questions or Make Task Items:

see @typesafe-checker-5.mmd

## Example: applying both algorithms

Suppose the previous agent reply is:

> "The audio buffer test failed. I found a missing packet bug. Alex's helper agent is already fixing it. I also noticed that the UI crashes when switching devices. Should I fix that crash? I can add a regression test afterward."

### After extraction

| ID | Extracted item                                       |
| -- | ---------------------------------------------------- |
| 1  | Audio buffer test failed                             |
| 2  | A missing-packet bug exists                          |
| 3  | Alex's helper agent is fixing the missing-packet bug |
| 4  | UI crashes when switching devices                    |
| 5  | Agent asks whether to fix the UI crash               |
| 6  | Agent offers to add a regression test afterward      |

### After normalization

| ID | Subject  | Action             | Status                    | Owner              |
| -- | -------- | ------------------ | ------------------------- | ------------------ |
| 1  | Test     | Reports failure    | Failed                    | Unknown            |
| 2  | Bug      | Reports problem    | In progress (linked to 3) | Helper             |
| 3  | Helper   | Reports assignment | In progress               | Helper             |
| 4  | UI bug   | Reports problem    | Unresolved                | Unassigned         |
| 5  | Decision | Requests approval  | Pending                   | User               |
| 6  | Test     | Offers future work | Conditional               | Agent, if accepted |

These records are then passed individually through the existing decision trees.

An important nuance: the failed test may be evidence of the missing-packet bug rather than a separate repair obligation. Linking them prevents redundant tasks, while preserving the test failure as evidence.

## 6. Recommended normalized data structure

I would use a structure like this:

```
{
  "id": "item_4",
  "sourceText": "I also noticed that the UI crashes when switching devices.",
  "subject": {
    "category": "code",
    "specific": "device switching UI"
  },
  "speechAct": "reports_problem",
  "status": "unresolved",
  "owner": "unassigned",
  "work": {
    "action": "fix",
    "target": "UI crash when switching devices",
    "expectedOutcome": "Switch devices without crashing"
  },
  "question": null,
  "dependencies": ["item_5"],
  "relatedItems": ["item_5"],
  "existingTaskId": null,
  "helperAssignmentId": null,
  "uncertainties": []
}
```

The two preparation steps should avoid setting `askRequired` or `taskRequired`. Those are outputs of the subsequent decision trees, not properties that extraction or normalization should decide in advance.

### One final improvement to the overall design

I recommend treating the extraction, normalization, and decision phases as producing three separate collections:

- `ExtractedItems` — what was said.
- `NormalizedItems` — what each item means, including relationships and current status.
- `AskQuestions` / `TaskItems` — what action should be taken.

This separation makes it possible to test the accuracy of each phase independently. It also gives you a way to determine whether a missed TaskList entry came from faulty extraction, incorrect normalization, or the decision-tree logic itself.

I haven't executed these diagrams against your custom parser, but they follow the required standalone node declarations and `Q_CHOICE_` branch conventions.

The main improvement over the existing typesafe-checker diagrams is that the tree now collects zero or more questions and zero or more tasks, rather than assuming there is exactly one decision for the entire reply.

I would make one further structural improvement before using this as an automation: move duplicate detection into the extraction/normalization phase, so multiple sentences referring to the same bug, question, or outstanding action become one canonical item rather than generating redundant questions or tasks.