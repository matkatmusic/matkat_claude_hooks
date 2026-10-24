import type { EntryType, Question } from '@typesafe-ai/sdk';
import type { Answer, ProbabilityTable, Summary, Version } from './types';

export function formatValueText(value: EntryType | undefined): string {
  const isMissing = value === undefined || value === null;
  if (isMissing)
    return '(none)';
  if (typeof value === 'string')
    return value;
  return JSON.stringify(value);
}

export function listOptionKeys(firstAnswer: Answer): string[] {
  if (firstAnswer.type === 'noul')
    return ['yes', 'no'];
  return Object.keys(firstAnswer.probabilities);
}

export function readValue(answer: Answer, key: string): number {
  if (answer.type === 'noul')
    return key === 'yes' ? answer.noul : 1 - answer.noul;
  const table: ProbabilityTable = answer.probabilities;
  return table[key];
}

export function readConfidence(answer: Answer): number {
  if (answer.type === 'noul')
    throw new Error('a noul answer has no confidence');
  return answer.confidence;
}

export function readTopKey(answer: Answer, keys: string[]): string {
  if (answer.type === 'choice')
    return answer.choice;
  let topKey = keys[0];
  for (const key of keys) {
    const keyValue = readValue(answer, key);
    const topValue = readValue(answer, topKey);
    if (keyValue > topValue)
      topKey = key;
  }
  return topKey;
}

export function readDescription(question: Question, key: string): string {
  if (question.type === 'noul') {
    const criteria = question.criteria;
    const isCriteriaMissing = criteria === undefined || criteria === null;
    if (isCriteriaMissing)
      return '(none)';
    return formatValueText(key === 'yes' ? criteria.true : criteria.false);
  }
  if (question.type === 'score')
    return formatValueText(question.criteria[Number(key)]);
  return formatValueText(question.criteria[key]);
}

export function listValues(answers: Answer[], key: string): number[] {
  const values: number[] = [];
  for (const answer of answers)
    values.push(readValue(answer, key));
  return values;
}

export function computeSummary(values: number[]): Summary {
  let low = values[0];
  let high = values[0];
  let sum = 0;
  for (const value of values) {
    if (value < low)
      low = value;
    if (value > high)
      high = value;
    sum += value;
  }
  return { low: low, high: high, average: sum / values.length };
}

export function listAnswers(version: Version, name: string): Answer[] {
  const answers: Answer[] = [];
  for (const output of version.outputs)
    answers.push(output.answers[name]);
  return answers;
}
