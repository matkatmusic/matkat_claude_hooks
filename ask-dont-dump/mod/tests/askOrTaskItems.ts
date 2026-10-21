import { isNodeAnswerYes, writeStageResult, type AskQuestion, type NormalizedItem, type ReplyState, type TaskItem, type TraceEntry } from "./checker5Calls";

const RESULT_NONE = "none";
const RESULT_ASK = "ask";
const RESULT_TASK = "task";
const RESULT_BOTH = "both";

async function isAskNeeded(replyState: ReplyState, item: NormalizedItem, trace: TraceEntry[]) {
  let isAskFound = await isNodeAnswerYes(replyState, "Q_EXPLICIT", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_BLOCKED", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_AMBIGUOUS", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_PERMISSION", "item", item, {}, trace);
  return isAskFound;
}

async function isTaskNeeded(replyState: ReplyState, item: NormalizedItem, trace: TraceEntry[]) {
  const taskListState = { taskList: replyState.taskList };
  let isWorkFound = await isNodeAnswerYes(replyState, "Q_ACTION", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_COMMITMENT", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_BUG", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_PENDING", "item", item, {}, trace);
  if (!isWorkFound)
    return false;

  const isOwned = await isNodeAnswerYes(replyState, "Q_OWNED", "item", item, taskListState, trace);
  if (isOwned)
    return false;
  const isTracked = await isNodeAnswerYes(replyState, "Q_TRACKED", "item", item, taskListState, trace);
  if (isTracked)
    return false;
  return true;
}

export async function decideAskOrTask(replyState: ReplyState, normalizedItems: NormalizedItem[], trace: TraceEntry[]) {
  const askQuestions: AskQuestion[] = [];
  const taskItems: TaskItem[] = [];
  for (const item of normalizedItems) {
    const isAskRequired = await isAskNeeded(replyState, item, trace);
    if (isAskRequired) {
      askQuestions.push({ itemId: item.id, sourceText: item.sourceText, question: item.question });
      continue;
    }
    const isTaskRequired = await isTaskNeeded(replyState, item, trace);
    if (isTaskRequired)
      taskItems.push({ itemId: item.id, sourceText: item.sourceText, work: item.work });
  }

  let result = RESULT_NONE;
  const hasAsk = askQuestions.length > 0;
  if (hasAsk) {
    const hasTaskAfterAsk = taskItems.length > 0;
    result = hasTaskAfterAsk ? RESULT_BOTH : RESULT_ASK;
  }
  else {
    const hasTask = taskItems.length > 0;
    result = hasTask ? RESULT_TASK : RESULT_NONE;
  }
  return { askQuestions, taskItems, result };
}

// bun mod/tests/askOrTaskItems.ts --from <normalize results file>; walks typesafe-checker-5.mmd from Q_MORE_ITEMS to the result for one reply
if (import.meta.main) {
  const fromFlagIndex = process.argv.indexOf("--from");
  const fromPath = process.argv[fromFlagIndex + 1];
  const isMissingFrom = fromFlagIndex < 0 || fromPath === undefined;
  if (isMissingFrom)
    throw new Error("missing --from <normalize results file>");
  const normalizeResult = await Bun.file(fromPath).json();
  const { id, replyState, normalizedItems } = normalizeResult;
  const startMilliseconds = Date.now();
  const trace: TraceEntry[] = [];
  const { askQuestions, taskItems, result } = await decideAskOrTask(replyState, normalizedItems, trace);
  const elapsedSeconds = (Date.now() - startMilliseconds) / 1000;
  const outPath = await writeStageResult("askOrTask", id, { id, replyState, normalizedItems, askQuestions, taskItems, result, trace, elapsedSeconds });
  console.log(outPath);
}
