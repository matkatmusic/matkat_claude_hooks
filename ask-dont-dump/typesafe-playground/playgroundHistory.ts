import { choice, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState } from '../mod/tests/checker5Calls';
import {
  buildOptions,
  TASK_NO_REASON_TEXT,
  TASK_QUESTION_TEXT,
  USER_NO_REASON_TEXT,
  USER_QUESTION_TEXT,
  type QuestionGroup,
} from '../mod/tests/askChoiceQuestions';

export const HISTORY_PATH = `${import.meta.dir}/results/playground-history.json`;
const SEED_REPLY_ID = 's3-replay-script-blocked';

// type Version = { id: number; time: string; state: unknown; questions: unknown; calls: number; outputs: unknown[] };
export type Version = { id: number; time: string; state: unknown; questions: unknown; calls: number; outputs: unknown[]; note?: string };

export async function loadHistory() {
  const history: Version[] = await Bun.file(HISTORY_PATH).json();
  return history;
}

export async function createSeedHistory() {
  const customFile: { questions: { groups: Record<string, QuestionGroup> } } =
    // await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
    await Bun.file(`${import.meta.dir}/../mod/tests/custom-questions.json`).json();
  const groups = customFile.questions.groups;
  const userOptions = buildOptions(groups, USER_NO_REASON_TEXT, ['Ask', 'Both']);
  const taskOptions = buildOptions(groups, TASK_NO_REASON_TEXT, ['Task', 'Both']);
  const questions: Questions = {
    needsUserResponse: choice(USER_QUESTION_TEXT, userOptions),
    needsTaskCreated: choice(TASK_QUESTION_TEXT, taskOptions),
  };
  const replyState = await loadReplyState(SEED_REPLY_ID);
  const state = { userPrompt: replyState.userPrompt, originalReply: replyState.reply.text };
  // const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [] };
  // const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [], note: '' };
  const seedVersion: Version = { id: 1, time: new Date().toISOString(), state, questions, calls: 0, outputs: [] };
  await Bun.write(HISTORY_PATH, JSON.stringify([seedVersion], null, 2) + '\n');
}
