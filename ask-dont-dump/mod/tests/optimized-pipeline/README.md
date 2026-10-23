# Optimized Ask-Or-Task pipeline

## Pipeline

1. `extractItems.ts` — **one Claude/Haiku call per reply** produces *atomic items already carrying normalized semantic fields*. Keeps questions and independently actionable work separate.
2. `normalizeItems.ts` — **no calls**: verifies types, exact source quotes, IDs, referenced task IDs, and derives text offsets.
3. `batchTypesafe.ts` — **one TypeSafe call per batch** (default 12 items, 6 Noul questions each). Instructions target `items[index]`. Configure batch size for provider limits.
4. `askOrTaskItems.ts` — **no calls**: applies Ask-first per-item routing, task ownership and duplicate guards, combines zero-or-more questions and tasks.
5. `runOptimized.ts` — Bun entrypoint; replaces the old per-node traversal and its five-second sleeps.

## Usage

Copy this folder into your Bun repository. Install `@typesafe-ai/sdk` if needed. Ensure `claude` is on PATH and your TypeSafe credentials are configured.

Input `state.json` format:

```json
{
  "reply": { "text": "I found a bug. Should I fix it?" },
  "userPrompt": "Review the code",
  "taskList": []
}
```

Run:

```bash
bun runOptimized.ts --from state.json --out result.json
```

The existing `category-labels.json` reader and `loadTaskList()` are **not included** because their companion files were not provided. Adapt your existing reader to supply `ReplyState`.

## Integration and validation notes

- The SDK call uses the public `client.systemOne({state,questions})` shape and multiple `noul()` questions. Provider-side max batch sizes and token budgets need validation in your environment.
- All questions are computed even when an early Ask predicate succeeds. This reduces round trips but increases Noul count; to reduce tokens further, first classify likely items in the extraction output, then request only applicable questions.
- This is not semantics-preserving relative to your prior model judgments: batching and collapsing extraction+normalization may produce different classifications. Compare on labeled test examples.
- `existingTaskId` is trusted only if it matches an actual task ID. A helper assignment ID is reported by the model, not independently verified: if you have a helper registry, verify that ID there before suppressing task creation.
- `0.65` is an **illustrative** threshold. Calibrate it to your annotated evaluation set and add abstention/review for scores near the boundary.
- An offline regression test passed and the TypeScript was type-checked using a temporary SDK declaration shim. No live TypeSafe/Claude calls were executed; live credentials and Bun tooling are not available here.
