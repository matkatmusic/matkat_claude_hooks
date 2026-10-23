import { basename } from 'node:path';
import type { ChoiceResponse } from '@typesafe-ai/sdk';

const MIN_CHOICE_PROBABILITY = 0.60;
const LABELS = ['yes', 'no', 'unclear'];
const UNCERTAIN = 'uncertain';

type ReplyResult = { main: { answers: Record<string, ChoiceResponse> } };
type TopLabel = { label: string; probability: number };
type CellStats = {
  questionId: string;
  replyId: string;
  topLabels: TopLabel[];
  rawAgreement: number;
  decisionAgreement: number;
  hasConflict: boolean;
  meanSpread: number;
  maxSpread: number;
  certainCount: number;
};
type QuestionTotals = {
  questionId: string;
  replyCount: number;
  rawSum: number;
  decisionSum: number;
  rawFlips: number;
  conflicts: number;
  spreadSum: number;
  maxSpread: number;
};
type QuestionRow = {
  questionId: string;
  meanRaw: number;
  meanDecision: number;
  rawFlips: number;
  conflicts: number;
  meanSpread: number;
  maxSpread: number;
};

function computeTimestamp() {
  const isoTime = new Date().toISOString();
  return isoTime.slice(0, 19).replaceAll(':', '-');
}

function findTopLabel(answer: ChoiceResponse): TopLabel {
  let topLabel = '';
  let topProbability = -1;
  for (const label of LABELS) {
    const probability = answer.probabilities[label] as number;
    const isHigher = probability > topProbability;
    if (isHigher) {
      topLabel = label;
      topProbability = probability;
    }
  }
  return { label: topLabel, probability: topProbability };
}

function computeDecision(top: TopLabel) {
  const isBelowThreshold = top.probability < MIN_CHOICE_PROBABILITY;
  if (isBelowThreshold)
    return UNCERTAIN;
  return top.label;
}

function countMostCommon(values: string[]) {
  const counts: Record<string, number> = {};
  let mostCommonCount = 0;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
    const isNewMost = (counts[value] as number) > mostCommonCount;
    if (isNewMost)
      mostCommonCount = counts[value] as number;
  }
  return mostCommonCount;
}

function computePopulationStd(values: number[]) {
  let sum = 0;
  for (const value of values)
    sum += value;
  const mean = sum / values.length;
  let squareSum = 0;
  for (const value of values)
    squareSum += (value - mean) ** 2;
  return Math.sqrt(squareSum / values.length);
}

function computeCellStats(questionId: string, replyId: string, answers: ChoiceResponse[]): CellStats {
  const runCount = answers.length;
  const topLabels: TopLabel[] = [];
  const decisions: string[] = [];
  const rawLabels: string[] = [];
  let certainCount = 0;
  let firstCertainDecision: string | undefined;
  let hasConflict = false;
  for (const answer of answers) {
    const top = findTopLabel(answer);
    const decision = computeDecision(top);
    topLabels.push(top);
    rawLabels.push(top.label);
    decisions.push(decision);
    const isCertain = decision !== UNCERTAIN;
    if (!isCertain)
      continue;
    certainCount++;
    if (firstCertainDecision === undefined)
      firstCertainDecision = decision;
    const isDifferentCertain = decision !== firstCertainDecision;
    if (isDifferentCertain)
      hasConflict = true;
  }
  let spreadSum = 0;
  let maxSpread = 0;
  for (const label of LABELS) {
    const probabilities: number[] = [];
    for (const answer of answers)
      probabilities.push(answer.probabilities[label] as number);
    const spread = computePopulationStd(probabilities);
    spreadSum += spread;
    const isHigherSpread = spread > maxSpread;
    if (isHigherSpread)
      maxSpread = spread;
  }
  return {
    questionId,
    replyId,
    topLabels,
    rawAgreement: countMostCommon(rawLabels) / runCount,
    decisionAgreement: countMostCommon(decisions) / runCount,
    hasConflict,
    meanSpread: spreadSum / LABELS.length,
    maxSpread,
    certainCount,
  };
}

function loadAnswer(runs: Record<string, ReplyResult>[], runIndex: number, replyId: string, questionId: string) {
  const reply = (runs[runIndex] as Record<string, ReplyResult>)[replyId];
  if (reply === undefined)
    throw new Error(`run ${runIndex + 1} is missing reply ${replyId}`);
  const answer = reply.main.answers[questionId];
  if (answer === undefined)
    throw new Error(`run ${runIndex + 1} is missing question ${questionId} for reply ${replyId}`);
  return answer;
}

function writeQuestionRow(row: QuestionRow) {
  return `| ${row.questionId} | ${row.meanRaw.toFixed(2)} | ${row.meanDecision.toFixed(2)} | ${row.rawFlips} | ${row.conflicts} | ${row.meanSpread.toFixed(2)} | ${row.maxSpread.toFixed(2)} |`;
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/compareRuns.ts <results/responses-A.json> <results/responses-B.json> ...
if (import.meta.main) {
  const resultsPaths = process.argv.slice(2);
  if (resultsPaths.length < 2)
    throw new Error('need 2 or more <results/responses-*.json> paths');
  const runs: Record<string, ReplyResult>[] = [];
  for (const resultsPath of resultsPaths)
    runs.push(await Bun.file(resultsPath).json());
  const runCount = runs.length;
  const firstRun = runs[0] as Record<string, ReplyResult>;

  const cells: CellStats[] = [];
  const totalsByQuestion: Record<string, QuestionTotals> = {};
  for (const replyId of Object.keys(firstRun)) {
    const firstAnswers = (firstRun[replyId] as ReplyResult).main.answers;
    for (const questionId of Object.keys(firstAnswers)) {
      const answers: ChoiceResponse[] = [];
      for (let runIndex = 0; runIndex < runCount; runIndex++)
        answers.push(loadAnswer(runs, runIndex, replyId, questionId));
      const cell = computeCellStats(questionId, replyId, answers);
      cells.push(cell);
      if (totalsByQuestion[questionId] === undefined)
        totalsByQuestion[questionId] = { questionId, replyCount: 0, rawSum: 0, decisionSum: 0, rawFlips: 0, conflicts: 0, spreadSum: 0, maxSpread: 0 };
      const totals = totalsByQuestion[questionId] as QuestionTotals;
      totals.replyCount++;
      totals.rawSum += cell.rawAgreement;
      totals.decisionSum += cell.decisionAgreement;
      if (cell.rawAgreement < 1)
        totals.rawFlips++;
      if (cell.hasConflict)
        totals.conflicts++;
      totals.spreadSum += cell.meanSpread;
      const isHigherSpread = cell.maxSpread > totals.maxSpread;
      if (isHigherSpread)
        totals.maxSpread = cell.maxSpread;
    }
  }

  const questionRows: QuestionRow[] = [];
  for (const questionId of Object.keys(totalsByQuestion)) {
    const totals = totalsByQuestion[questionId] as QuestionTotals;
    const row: QuestionRow = {
      questionId,
      meanRaw: totals.rawSum / totals.replyCount,
      meanDecision: totals.decisionSum / totals.replyCount,
      rawFlips: totals.rawFlips,
      conflicts: totals.conflicts,
      meanSpread: totals.spreadSum / totals.replyCount,
      maxSpread: totals.maxSpread,
    };
    let insertIndex = questionRows.length;
    for (let index = 0; index < questionRows.length; index++) {
      const other = questionRows[index] as QuestionRow;
      const isLowerDecision = row.meanDecision < other.meanDecision;
      const isSameDecision = row.meanDecision === other.meanDecision;
      const isLowerRaw = row.meanRaw < other.meanRaw;
      const isWorseThanOther = isLowerDecision || (isSameDecision && isLowerRaw);
      if (isWorseThanOther) {
        insertIndex = index;
        break;
      }
    }
    questionRows.splice(insertIndex, 0, row);
  }

  const fileNames: string[] = [];
  for (const resultsPath of resultsPaths)
    fileNames.push(basename(resultsPath));
  const lines: string[] = [];
  lines.push(`# Consistency across ${runCount} runs: ${fileNames.join(', ')}`);
  lines.push('');
  lines.push('## Questions');
  lines.push('| Question | Mean raw agreement | Mean decision agreement | Replies with raw flip | Replies with decision conflict | Mean probability spread | Max probability spread |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const row of questionRows)
    lines.push(writeQuestionRow(row));
  lines.push('');
  lines.push('## Unstable answers');
  const runHeaders: string[] = [];
  for (let runIndex = 0; runIndex < runCount; runIndex++)
    runHeaders.push(`Run ${runIndex + 1}`);
  lines.push(`| Question | Reply | ${runHeaders.join(' | ')} | Decision agreement |`);
  lines.push(`|${'---|'.repeat(runCount + 3)}`);
  let rawSum = 0;
  let decisionSum = 0;
  let certainTotal = 0;
  for (const cell of cells) {
    rawSum += cell.rawAgreement;
    decisionSum += cell.decisionAgreement;
    certainTotal += cell.certainCount;
    const isUnstable = cell.rawAgreement < 1 || cell.hasConflict;
    if (!isUnstable)
      continue;
    const runCells: string[] = [];
    for (const top of cell.topLabels)
      runCells.push(`${top.label} ${top.probability.toFixed(2)}`);
    lines.push(`| ${cell.questionId} | ${cell.replyId} | ${runCells.join(' | ')} | ${cell.decisionAgreement.toFixed(2)} |`);
  }
  lines.push('');
  const meanRaw = rawSum / cells.length;
  const meanDecision = decisionSum / cells.length;
  const certainShare = certainTotal / (cells.length * runCount);
  lines.push(`Overall: mean raw agreement ${meanRaw.toFixed(2)}, mean decision agreement ${meanDecision.toFixed(2)}, share of decisions not uncertain ${certainShare.toFixed(2)}`);

  const reportPath = `${import.meta.dir}/results/consistency-${computeTimestamp()}.md`;
  await Bun.write(reportPath, `${lines.join('\n')}\n`);
  console.log(reportPath);
}
