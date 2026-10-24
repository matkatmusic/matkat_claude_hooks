import type { Question } from '@typesafe-ai/sdk';
import type { Answer, WinnerGroup } from './types';
import { listOptionKeys, readDescription, readTopKey } from './values';

export function listWinnerGroups(answers: Answer[]): WinnerGroup[] {
  const keys = listOptionKeys(answers[0]);
  const groupKeys: string[] = [];
  const groupRuns: number[][] = [];
  for (let i = 0; i < answers.length; i++) {
    const topKey = readTopKey(answers[i], keys);
    const groupIndex = groupKeys.indexOf(topKey);
    if (groupIndex < 0) {
      groupKeys.push(topKey);
      groupRuns.push([i + 1]);
    }
    else {
      groupRuns[groupIndex].push(i + 1);
    }
  }
  const groups: WinnerGroup[] = [];
  for (let g = 0; g < groupKeys.length; g++)
    groups.push({ key: groupKeys[g], runs: groupRuns[g] });
  return groups;
}

export function formatWinnerLine(question: Question, group: WinnerGroup): string {
  return readDescription(question, group.key) + ' (' + group.runs.join(',') + ')';
}
