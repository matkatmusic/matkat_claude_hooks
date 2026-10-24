import type { Answer, BarInfoRequest, InfoPart, InfoRow } from './types';
import { computeSummary, listValues, readConfidence, readDescription, readTopKey } from './values';

const LABEL = 'info-label';
const VALUE = 'info-value';
const NUMBER = 'info-value info-num';

function formatThreeDecimals(value: number): string {
  return value.toFixed(3);
}

function listRangeParts(lowText: string, highText: string, averageText: string): InfoPart[] {
  return [['min: ', LABEL], [lowText, NUMBER], ['  max: ', LABEL], [highText, NUMBER], ['  avg: ', LABEL], [averageText, NUMBER]];
}

function computeAverageConfidence(answers: Answer[]): number {
  let confidenceSum = 0;
  for (const answer of answers)
    confidenceSum += readConfidence(answer);
  return confidenceSum / answers.length;
}

function countTopRuns(answers: Answer[], keys: string[], key: string): number {
  let topCount = 0;
  for (const answer of answers) {
    const topKey = readTopKey(answer, keys);
    if (topKey === key)
      topCount++;
  }
  return topCount;
}

export function buildBarInfoRows(request: BarInfoRequest): InfoRow[] {
  const { question, answers, key, keys, pinnedValues, callIndex, pinnedId } = request;
  const isBarShown = callIndex !== null;
  let messageText = '';
  let scoreText = '';
  let confidenceText = '';
  let lowText = '';
  let highText = '';
  let averageText = '';
  let topCountText = '';
  let pinnedLowText = '';
  let pinnedHighText = '';
  let pinnedAverageText = '';
  if (isBarShown) {
    const values = listValues(answers, key);
    const stat = computeSummary(values);
    messageText = readDescription(question, key);
    lowText = formatThreeDecimals(stat.low);
    highText = formatThreeDecimals(stat.high);
    averageText = formatThreeDecimals(stat.average);
    if (callIndex >= 0) {
      scoreText = formatThreeDecimals(values[callIndex]);
      confidenceText = formatThreeDecimals(readConfidence(answers[callIndex]));
    }
    if (callIndex === -1) {
      scoreText = formatThreeDecimals(stat.average);
      confidenceText = formatThreeDecimals(computeAverageConfidence(answers));
    }
    topCountText = String(countTopRuns(answers, keys, key));
    if (pinnedValues !== null) {
      const pinnedStat = computeSummary(pinnedValues);
      pinnedLowText = formatThreeDecimals(pinnedStat.low);
      pinnedHighText = formatThreeDecimals(pinnedStat.high);
      pinnedAverageText = formatThreeDecimals(pinnedStat.average);
    }
  }
  const choiceText = isBarShown ? key : '';
  const rows: InfoRow[] = [];
  rows.push({ label: 'Choice:', parts: [[choiceText, VALUE]] });
  rows.push({ label: 'Score:', parts: [[scoreText, NUMBER], ['  Confidence: ', LABEL], [confidenceText, NUMBER]] });
  rows.push({ label: 'Range:', parts: listRangeParts(lowText, highText, averageText) });
  if (isBarShown)
    rows.push({ label: 'Top choice in', parts: [[topCountText, VALUE], [' of ', LABEL], [String(answers.length), VALUE], [' runs', LABEL]] });
  if (pinnedValues !== null)
    rows.push({ label: `Pinned v${pinnedId}:`, parts: listRangeParts(pinnedLowText, pinnedHighText, pinnedAverageText) });
  rows.push({ label: 'Message:', parts: [[messageText, VALUE]] });
  return rows;
}
