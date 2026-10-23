import { noul, TypeSafeClient, type Questions, type NoulResponse } from '@typesafe-ai/sdk';
import type { NormalizedItem, ReplyState, Scores } from './types';

const DEFINITIONS = {
  Q_EXPLICIT: 'Does this item explicitly ask the user for an answer or decision? Do not count rhetorical questions, quotations, or questions the user already answered.',
  Q_BLOCKED: 'Is required work currently blocked because essential information or a decision from the user is missing?',
  Q_PERMISSION: 'Does the proposed action require approval from the user that has not already been provided in the original request?',
  Q_ACTION: 'Does this item describe concrete unfinished work that the agent is responsible for carrying out? Not an optional offer, historical work, or a completed action.',
  Q_BUG: 'Does this item report a real unresolved bug, failure, or issue requiring follow-up work rather than only reporting a test result?',
  Q_COMMITMENT: 'Does this item record an outstanding commitment by the agent to perform an action, not a hypothetical suggestion?',
} as const;

type Predicate = keyof typeof DEFINITIONS;
const predicates = Object.keys(DEFINITIONS) as Predicate[];

/** All Noul questions reference one specific item by index in shared state.
 * One batch per at most maxItemsPerCall extracted items; no one-call-per-node loop. */
export async function evaluateBatch(
  replyState: ReplyState,
  items: NormalizedItem[],
  options: { client?: TypeSafeClient; maxItemsPerCall?: number } = {},
): Promise<Scores> {
  const scores: Scores = {};
  if (!items.length) return scores;
  const client = options.client ?? new TypeSafeClient();
  const maxItems = options.maxItemsPerCall ?? 12;
  if (!Number.isInteger(maxItems) || maxItems < 1) throw new Error('maxItemsPerCall must be positive integer');
  for (let offset = 0; offset < items.length; offset += maxItems) {
    const batch = items.slice(offset, offset + maxItems);
    const questions: Questions = {};
    batch.forEach((item, index) => {
      scores[item.id] = {};
      for (const predicate of predicates) {
        const key = `item${index}_${predicate}`;
        questions[key] = noul([
          'Evaluate ONLY the extracted item at `items[' + index + ']`.',
          DEFINITIONS[predicate],
          'Use `reply` and `userPrompt` for context; other items may resolve references.',
          'Answer yes only if supported by the available evidence.',
        ].join(' '));
      }
    });
    const response = await client.systemOne({
      state: {
        reply: replyState.reply.text,
        userPrompt: replyState.userPrompt,
        items: batch,
      },
      questions,
    });
    batch.forEach((item, index) => {
      for (const predicate of predicates) {
        const key = `item${index}_${predicate}`;
        const responseValue = (response.answers as Record<string, NoulResponse>)[key];
        if (!responseValue || !Number.isFinite(responseValue.noul)) throw new Error(`Missing/invalid TypeSafe answer: ${key}`);
        scores[item.id][predicate] = responseValue.noul;
      }
    });
  }
  return scores;
}
