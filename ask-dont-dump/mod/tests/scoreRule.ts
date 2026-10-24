import type { ChoiceResponse } from '@typesafe-ai/sdk';

const ASK_SIGNS = [
  'asksQuestion',
  'choiceNotMade',
  'waitingForUserAction',
  'optionsWithNoPick',
  'saysWaitingForSignalToBegin',
  'notVerified',
  'somethingNotChecked',
  'answerNotConfirmed',
];
const TASK_SIGNS = ['problemFoundInCode', 'aboutABug'];
// const BLOCK_SIGNS = ['workAlreadyOnTaskList', 'helperAlreadyDoing', 'waitsForResult', 'tasksAddedToTaskList'];
const BLOCK_SIGNS = ['workAlreadyOnTaskList', 'helperAlreadyDoing', 'waitsForResult'];
const ASK_BLOCK_SIGNS = ['tasksAddedToTaskList'];
const MIN_YES_PROBABILITY = 0.6;
const NEAR_MARGIN = 0.05;

type ReplyResult = { main: { answers: Record<string, ChoiceResponse> } };
type LabeledReply = { id: string; expectedResult: string };
type SignList = { name: string; signs: string[] };

const SIGN_LISTS: SignList[] = [
  { name: 'ASK', signs: ASK_SIGNS },
  { name: 'TASK', signs: TASK_SIGNS },
  { name: 'BLOCK', signs: BLOCK_SIGNS },
  { name: 'BLOCK', signs: ASK_BLOCK_SIGNS },
];

function loadYes(answers: Record<string, ChoiceResponse>, questionId: string, replyId: string, runIndex: number) {
  const answer = answers[questionId];
  if (answer === undefined)
    throw new Error(`run ${runIndex + 1} is missing question ${questionId} for reply ${replyId}`);
  return answer.probabilities.yes as number;
}

function countFiringSigns(answers: Record<string, ChoiceResponse>, signs: string[], replyId: string, runIndex: number) {
  let firingCount = 0;
  for (const questionId of signs) {
    const isFiring = loadYes(answers, questionId, replyId, runIndex) >= MIN_YES_PROBABILITY;
    if (isFiring)
      firingCount++;
  }
  return firingCount;
}

function computeResult(answers: Record<string, ChoiceResponse>, replyId: string, runIndex: number) {
  // const isAsk = countFiringSigns(answers, ASK_SIGNS, replyId, runIndex) > 0;
  // const hasTaskSign = countFiringSigns(answers, TASK_SIGNS, replyId, runIndex) > 0;
  // const hasBlockSign = countFiringSigns(answers, BLOCK_SIGNS, replyId, runIndex) > 0;
  // const isTask = hasTaskSign && !hasBlockSign;
  // if (isAsk && isTask)
  //   return 'both';
  // if (isAsk)
  //   return 'ask';
  // if (isTask)
  //   return 'task';
  // return 'none';
  const hasAskSign = countFiringSigns(answers, ASK_SIGNS, replyId, runIndex) > 0;
  const hasTaskSign = countFiringSigns(answers, TASK_SIGNS, replyId, runIndex) > 0;
  const hasBlockSign = countFiringSigns(answers, BLOCK_SIGNS, replyId, runIndex) > 0;
  const hasAskBlockSign = countFiringSigns(answers, ASK_BLOCK_SIGNS, replyId, runIndex) > 0;
  const hasBugSign = hasTaskSign && !hasBlockSign;
  const isAsk = hasAskSign || hasBugSign;
  if (hasAskBlockSign)
    return 'none';
  if (isAsk)
    return 'ask';
  return 'none';
}

function findMostCommon(values: string[]) {
  const counts: Record<string, number> = {};
  let mostCommon = '';
  let mostCommonCount = 0;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
    const isNewMost = (counts[value] as number) > mostCommonCount;
    if (isNewMost) {
      mostCommon = value;
      mostCommonCount = counts[value] as number;
    }
  }
  return mostCommon;
}

function buildSignLines(answersPerRun: Record<string, ChoiceResponse>[], replyId: string) {
  const signLines: string[] = [];
  for (const signList of SIGN_LISTS) {
    for (const questionId of signList.signs) {
      let sum = 0;
      let minYes = Infinity;
      let maxYes = -Infinity;
      let isNear = false;
      for (let runIndex = 0; runIndex < answersPerRun.length; runIndex++) {
        const yes = loadYes(answersPerRun[runIndex] as Record<string, ChoiceResponse>, questionId, replyId, runIndex);
        sum += yes;
        if (yes < minYes)
          minYes = yes;
        if (yes > maxYes)
          maxYes = yes;
        const isNearCutoff = Math.abs(yes - MIN_YES_PROBABILITY) <= NEAR_MARGIN;
        if (isNearCutoff)
          isNear = true;
      }
      const hasFired = maxYes >= MIN_YES_PROBABILITY;
      if (!hasFired)
        continue;
      const meanYes = sum / answersPerRun.length;
      const nearMark = isNear ? ' near' : '';
      signLines.push(`  ${signList.name} ${questionId} mean ${meanYes.toFixed(2)} range ${minYes.toFixed(2)}-${maxYes.toFixed(2)}${nearMark}`);
    }
  }
  return signLines;
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/scoreRule.ts <results/responses-*.json> [more run files]
if (import.meta.main) {
  const resultsPaths = process.argv.slice(2);
  if (resultsPaths.length < 1)
    throw new Error('need 1 or more <results/responses-*.json> paths');
  const categoryLabels: { replies: LabeledReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  const runs: Record<string, ReplyResult>[] = [];
  for (const resultsPath of resultsPaths)
    runs.push(await Bun.file(resultsPath).json());

  let scoredCount = 0;
  let matchCount = 0;
  let skippedCount = 0;
  const detailLines: string[] = [];
  for (const reply of categoryLabels.replies) {
    const results: string[] = [];
    const answersPerRun: Record<string, ChoiceResponse>[] = [];
    for (let runIndex = 0; runIndex < runs.length; runIndex++) {
      const runReply = (runs[runIndex] as Record<string, ReplyResult>)[reply.id];
      if (runReply === undefined) {
        skippedCount++;
        continue;
      }
      answersPerRun.push(runReply.main.answers);
      results.push(computeResult(runReply.main.answers, reply.id, runIndex));
    }
    const isScored = results.length > 0;
    if (!isScored)
      continue;
    scoredCount++;
    const mostCommon = findMostCommon(results);
    const isMatch = mostCommon === reply.expectedResult;
    if (isMatch)
      matchCount++;
    let isChanging = false;
    for (const result of results) {
      const isDifferent = result !== results[0];
      if (isDifferent)
        isChanging = true;
    }
    const isReported = !isMatch || isChanging;
    if (!isReported)
      continue;
    detailLines.push('');
    detailLines.push(reply.id);
    detailLines.push(`  want: ${reply.expectedResult}`);
    detailLines.push(`  got: ${results.join(', ')}`);
    for (const signLine of buildSignLines(answersPerRun, reply.id))
      detailLines.push(signLine);
  }

  console.log(`${matchCount} of ${scoredCount} replies match expectedResult (${skippedCount} reply-run pairs skipped: reply not in that run file)`);
  for (const line of detailLines)
    console.log(line);
}
