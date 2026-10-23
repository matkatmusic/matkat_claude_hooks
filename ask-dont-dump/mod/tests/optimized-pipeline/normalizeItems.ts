import type { Extraction, NormalizedItem, ReplyState } from './types';
import { assert, isRecord, nonempty } from './types';

const speechActs = new Set(['report','question','request','commit','offer','recommend','assign','other']);
const statuses = new Set(['completed','unresolved','pending','blocked','hypothetical','unknown']);
const owners = new Set(['agent','helper','user','external','unknown']);

/** No model calls. Validate extraction, derive offsets, verify exact task links. */
export function normalizeItems(replyState: ReplyState, extraction: Extraction): NormalizedItem[] {
  const usedIds = new Set<string>();
  const reply = replyState.reply.text;
  const taskIds = new Set(replyState.taskList.map(t => t.id));
  const items: NormalizedItem[] = [];
  for (const [index, raw] of extraction.items.entries()) {
    assert(isRecord(raw), `item ${index} must be object`);
    assert(nonempty(raw.id) && !usedIds.has(raw.id), `item ${index} invalid/duplicate id`);
    usedIds.add(raw.id);
    assert(nonempty(raw.text), `item ${raw.id}: missing text`);
    assert(nonempty(raw.sourceText), `item ${raw.id}: missing sourceText`);
    const location = reply.indexOf(raw.sourceText);
    assert(location >= 0, `item ${raw.id}: sourceText not found verbatim in reply`);
    assert(isRecord(raw.subject) && nonempty(raw.subject.category) && nonempty(raw.subject.specific), `item ${raw.id}: bad subject`);
    assert(speechActs.has(String(raw.speechAct)), `item ${raw.id}: bad speechAct`);
    assert(statuses.has(String(raw.status)), `item ${raw.id}: bad status`);
    assert(owners.has(String(raw.owner)), `item ${raw.id}: bad owner`);
    assert(raw.question === null || (isRecord(raw.question) && nonempty(raw.question.text) && typeof raw.question.requestedAnswer === 'string'), `item ${raw.id}: bad question`);
    assert(raw.work === null || (isRecord(raw.work) && ['action','target','expectedOutcome','completionCondition'].every(k => typeof (raw.work as unknown as Record<string, unknown>)[k] === 'string')), `item ${raw.id}: bad work`);
    assert(Array.isArray(raw.dependencies) && raw.dependencies.every(nonempty), `item ${raw.id}: bad dependencies`);
    assert(Array.isArray(raw.relatedItems) && raw.relatedItems.every(nonempty), `item ${raw.id}: bad relatedItems`);
    assert(Array.isArray(raw.uncertainties) && raw.uncertainties.every(nonempty), `item ${raw.id}: bad uncertainties`);
    assert(raw.existingTaskId === null || typeof raw.existingTaskId === 'string', `item ${raw.id}: bad existingTaskId`);
    assert(raw.helperAssignmentId === null || typeof raw.helperAssignmentId === 'string', `item ${raw.id}: bad helperAssignmentId`);
    const existingTaskId = raw.existingTaskId && taskIds.has(raw.existingTaskId) ? raw.existingTaskId : null;
    const uncertainties = [...raw.uncertainties];
    if (raw.existingTaskId && !existingTaskId) uncertainties.push(`Unverified existing task ID: ${raw.existingTaskId}`);
    items.push({ ...raw, location, sourceEnd: location + raw.sourceText.length, existingTaskId, uncertainties } as NormalizedItem);
  }
  const itemIds = new Set(items.map(i => i.id));
  for (const item of items) {
    for (const id of item.relatedItems) assert(itemIds.has(id), `item ${item.id}: unknown related item ${id}`);
  }
  return items;
}
