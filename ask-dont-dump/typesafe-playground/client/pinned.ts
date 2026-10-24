import type { PinnedData, Version } from './types';
import { listAnswers, listOptionKeys } from './values';

export function findPinned(versions: Version[], pinnedId: number | null): Version | null {
  for (const version of versions) {
    if (version.id === pinnedId)
      return version;
  }
  return null;
}

export function readPinnedData(pinnedVersion: Version | null, name: string): PinnedData | null {
  if (pinnedVersion === null)
    return null;
  const hasQuestion = pinnedVersion.questions[name] !== undefined;
  const hasOutputs = pinnedVersion.outputs.length > 0;
  if (!hasQuestion)
    return null;
  if (!hasOutputs)
    return null;
  if (pinnedVersion.outputs[0].answers[name] === undefined)
    return null;
  const answers = listAnswers(pinnedVersion, name);
  const keys = listOptionKeys(answers[0]);
  return { question: pinnedVersion.questions[name], answers: answers, keys: keys };
}
