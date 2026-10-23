import type { AskQuestion, Decision, NormalizedItem, ReplyState, Scores, TaskItem, TraceEntry } from './types';

import { SCORE_THRESHOLD } from '../checker5Calls';

// export const DEFAULT_THRESHOLD = 0.65; // Must be tuned on labeled data, not assumed calibrated.

/** Deterministic interpretation of cached Noul probabilities. One item has one
 * terminal action; splitting question/work in extraction allows both overall. */
export function decideAskOrTask(
  replyState: ReplyState,
  items: NormalizedItem[],
  scores: Scores,
  threshold = SCORE_THRESHOLD,
): Decision & { trace: TraceEntry[] } {
  const askQuestions: AskQuestion[] = [];
  const taskItems: TaskItem[] = [];
  const trace: TraceEntry[] = [];
  const seenQuestions = new Set<string>();
  const seenTasks = new Set<string>();
  const existingIds = new Set(replyState.taskList.map(t => t.id));
  const pass = (item: NormalizedItem, predicate: keyof Scores[string]) => {
    const score = scores[item.id]?.[predicate];
    if (score === undefined || !Number.isFinite(score)) throw new Error(`Missing Noul score ${item.id}.${predicate}`);
    const isYes = score > threshold;
    // trace.push({ node: predicate, focusId: item.id, score, isYes, source: 'typesafe' });
    trace.push({ node: predicate, focusId: item.id, score, isYes });
    return isYes;
  };

  for (const item of items) {
    // Classifier is batched, but the original Ask -> Task policy is evaluated in code.
    const isAsk = pass(item, 'Q_EXPLICIT') || pass(item, 'Q_BLOCKED') || pass(item, 'Q_PERMISSION');
    if (isAsk) {
      // const question = item.question ?? { text: `What decision or information is needed regarding: ${item.text}?`, requestedAnswer: 'Clarification or approval' };
      const question = item.question;
      const key = (question ? question.text : item.id).trim().toLowerCase();
      if (!seenQuestions.has(key)) {
        seenQuestions.add(key);
        askQuestions.push({ itemId: item.id, sourceText: item.sourceText, question });
      }
      continue;
    }
    const isWork = pass(item, 'Q_ACTION') || pass(item, 'Q_BUG') || pass(item, 'Q_COMMITMENT');
    if (!isWork || !item.work) continue;
    if (item.status === 'completed' || item.status === 'hypothetical' || item.speechAct === 'offer') continue;
    // Only suppress ownership when linked to a VERIFIED task or explicit helper assignment.
    if (item.existingTaskId && existingIds.has(item.existingTaskId)) continue;
    if (item.owner === 'helper' && item.helperAssignmentId) continue;
    const key = `${item.work.action.trim().toLowerCase()}|${item.work.target.trim().toLowerCase()}`;
    if (seenTasks.has(key)) continue;
    seenTasks.add(key);
    taskItems.push({ itemId: item.id, sourceText: item.sourceText, work: item.work });
  }

  const result = askQuestions.length ? (taskItems.length ? 'both' : 'ask') : (taskItems.length ? 'task' : 'none');
  return { askQuestions, taskItems, result, trace };
}
