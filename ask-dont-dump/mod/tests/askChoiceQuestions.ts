import { choice, TypeSafeClient, type ChoiceResponse, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState } from './checker5Calls';

const MIN_CHOICE_PROBABILITY = 0.9;
const MIN_CONFIDENCE = 0.9;
const NO_REASON_KEY = 'no_reason';
export const USER_NO_REASON_TEXT = 'nothing in this message signals a response or decision is required by the user';
export const TASK_NO_REASON_TEXT = 'nothing in this message signals that a task should be created.';
export const USER_QUESTION_TEXT = 'Why does this message need the User to respond?';
export const TASK_QUESTION_TEXT = 'Why does this message indicate a task needs to be created?';
const DOES_PREFIX = 'Does ';

type ChoiceGroup = 'Ask' | 'Task' | 'Both' | 'Neither';
type CustomQuestion = { active: boolean; ask: string; choiceGroup: ChoiceGroup; followUpRule?: string; followUps?: { active: boolean; ask: string }[] };
export type QuestionGroup = { active: boolean; [questionId: string]: CustomQuestion | boolean };
type ExpectedReply = { id: string; expectedResult: string };

function computeTimestamp() {
  const isoTime = new Date().toISOString();
  return isoTime.replaceAll(':', '-').replaceAll('.', '-');
}

export function buildOptions(groups: Record<string, QuestionGroup>, noReasonText: string, keptChoiceGroups: ChoiceGroup[]) {
  const options: Record<string, string> = {};
  for (const group of Object.values(groups)) {
    for (const [questionId, groupEntry] of Object.entries(group)) {
      const isGroupFlag = questionId === 'active';
      if (isGroupFlag)
        continue;
      const customQuestion = groupEntry as CustomQuestion;
      const hasChoiceGroup = customQuestion.choiceGroup !== undefined;
      if (!hasChoiceGroup)
        throw new Error(`question has no choiceGroup: ${questionId}`);
      const isKeptChoiceGroup = keptChoiceGroups.includes(customQuestion.choiceGroup);
      if (!isKeptChoiceGroup)
        continue;
      const isDoesQuestion = customQuestion.ask.startsWith(DOES_PREFIX);
      if (!isDoesQuestion)
        continue;
      const withoutPrefix = customQuestion.ask.slice(DOES_PREFIX.length);
      options[questionId] = withoutPrefix.replaceAll('?', '');
    }
  }
  options[NO_REASON_KEY] = noReasonText;
  return options;
}

function computeFires(answer: ChoiceResponse) {
  const isReason = answer.choice !== NO_REASON_KEY;
  const isProbable = (answer.probabilities[answer.choice] as number) >= MIN_CHOICE_PROBABILITY;
  const isConfident = answer.confidence >= MIN_CONFIDENCE;
  return isReason && isProbable && isConfident;
}

function formatAnswer(answer: ChoiceResponse) {
  const probability = (answer.probabilities[answer.choice] as number).toFixed(2);
  return `${answer.choice} p=${probability} c=${answer.confidence.toFixed(2)}`;
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/askChoiceQuestions.ts [--reply <replyId>] [--dry-run]
if (import.meta.main) {
  const customFile: { questions: { groups: Record<string, QuestionGroup> } } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const categoryLabels: { replies: ExpectedReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  const isDryRun = process.argv.includes('--dry-run');
  const replyFlagIndex = process.argv.indexOf('--reply');
  const hasReplyFlag = replyFlagIndex >= 0;
  const requestedReplyId = hasReplyFlag ? process.argv[replyFlagIndex + 1] : undefined;
  const isMissingReplyValue = hasReplyFlag && (requestedReplyId === undefined || requestedReplyId.startsWith('--'));
  if (isMissingReplyValue)
    throw new Error('missing --reply <replyId>');
  let isReplyFound = false;
  for (const reply of categoryLabels.replies) {
    if (reply.id === requestedReplyId)
      isReplyFound = true;
  }
  const isUnknownReply = hasReplyFlag && !isReplyFound;
  if (isUnknownReply)
    throw new Error(`no reply has id: ${requestedReplyId}`);

  const userOptions = buildOptions(customFile.questions.groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  const taskOptions = buildOptions(customFile.questions.groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  const questions: Questions = {
    needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
    needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  };
  const client = new TypeSafeClient();
  const responsesByReply: Record<string, unknown> = {};
  let askExpectedCount = 0;
  let askExpectedGotAskCount = 0;
  let noneExpectedCount = 0;
  let noneExpectedGotNoAskCount = 0;
  for (const reply of categoryLabels.replies) {
    const isReplySkipped = hasReplyFlag && reply.id !== requestedReplyId;
    if (isReplySkipped)
      continue;
    const replyState = await loadReplyState(reply.id);
    const state = { message: replyState.reply.text };
    if (isDryRun) {
      console.log(JSON.stringify({ state, questions }, null, 2));
      console.log(`userOptions: ${Object.keys(userOptions).length}  taskOptions: ${Object.keys(taskOptions).length}`);
      continue;
    }
    const response = await client.systemOne({ state, questions });
    responsesByReply[reply.id] = response;
    const answers = response.answers as Record<string, ChoiceResponse>;
    const userAnswer = answers.needsUserResponse as ChoiceResponse;
    const taskAnswer = answers.needsTaskCreated as ChoiceResponse;
    const actions: string[] = [];
    const isAsk = computeFires(userAnswer);
    if (isAsk)
      actions.push('AskUserQuestion');
    const isTask = computeFires(taskAnswer);
    if (isTask)
      actions.push('CreateTask');
    const actionText = actions.length > 0 ? actions.join('+') : 'none';
    console.log(`${reply.id}  expected=${reply.expectedResult}  user: ${formatAnswer(userAnswer)}  task: ${formatAnswer(taskAnswer)}  actions=${actionText}`);
    const isExpectedAsk = reply.expectedResult === 'ask';
    if (isExpectedAsk) {
      askExpectedCount++;
      if (isAsk)
        askExpectedGotAskCount++;
    }
    const isExpectedNone = reply.expectedResult === 'none';
    if (isExpectedNone) {
      noneExpectedCount++;
      if (!isAsk)
        noneExpectedGotNoAskCount++;
    }
  }
  if (!isDryRun) {
    console.log(`expected ask, got AskUserQuestion: ${askExpectedGotAskCount} of ${askExpectedCount}`);
    console.log(`expected none, got no AskUserQuestion: ${noneExpectedGotNoAskCount} of ${noneExpectedCount}`);
    const resultsPath = `${import.meta.dir}/results/choices-${computeTimestamp()}.json`;
    await Bun.write(resultsPath, JSON.stringify(responsesByReply, null, 2));
    console.log(resultsPath);
  }
}
