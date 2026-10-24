import type { InfoPart, RunOutput, Version } from './types';

export const INPUT_COST_PER_MILLION = 0.042;
const LABEL = 'info-label';
const VALUE = 'info-value';
const SEPARATOR = ' · ';

export function isTextEdited(stateText: string, questionsText: string, version: Version): boolean {
  const isStateChanged = stateText !== JSON.stringify(version.state, null, 2);
  const isQuestionsChanged = questionsText !== JSON.stringify(version.questions, null, 2);
  return isStateChanged || isQuestionsChanged;
}

export function createEditedVersion(shownVersion: Version, versionCount: number): Version {
  return { ...shownVersion, id: versionCount + 1, time: 'not run yet', calls: 0, outputs: [], note: '' };
}

export function computeInputTokens(outputs: RunOutput[]): number {
  let inputTokens = 0;
  for (const output of outputs)
    inputTokens += output.usage.input_tokens;
  return inputTokens;
}

export function listVersionLineParts(shownNumber: number, versionCount: number, time: string, calls: number): InfoPart[] {
  return [
    ['version ', LABEL],
    [String(shownNumber), VALUE],
    [' of ', LABEL],
    [String(versionCount), VALUE],
    [SEPARATOR, LABEL],
    [time, VALUE],
    [SEPARATOR, LABEL],
    [String(calls), VALUE],
    [calls === 1 ? ' call' : ' calls', LABEL],
  ];
}

export function listPinLineParts(pinnedId: number | null): InfoPart[] {
  if (pinnedId === null)
    return [['nothing pinned', 'other-label']];
  return [['pinned: version ', LABEL], [String(pinnedId), VALUE]];
}

export function listCostLineParts(inputTokens: number): InfoPart[] {
  const costText = '$' + (inputTokens * INPUT_COST_PER_MILLION / 1000000).toFixed(6);
  return [
    ['cost: ', LABEL],
    [costText, VALUE],
    [SEPARATOR, LABEL],
    [String(inputTokens), VALUE],
    [' input tokens', LABEL],
  ];
}
