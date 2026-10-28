import type { Register, Hook, EngineInterface } from 'claude-code';
import { loadOpenTasks, isEveryTaskNumberOpen, formatOpenTasks, type OpenTask } from './taskList';

const CHECKER_MODEL = 'claude-haiku-5-5';
const CHECKER_TIMEOUT_MS = 30 * 1000;
const PLUGIN_NAME = 'ask-dont-dump';
const DISPATCHER_DIR = '../../dispatcher';

const QUESTION_OR_CHOICE_TEXT = 'Your last message has a question or choice for the user. Use AskUserQuestion to have the user make a decision for each question or choice item in the message.';
const UNFINISHED_WORK_TEXT = 'Your last message has incomplete or unstarted work. Use TaskCreate to track the work.';
const BUG_REPORT_TEXT = "Your last message reported a bug. Create a task in the session task list with TaskCreate to track the bug's resolution. Write a regression test for the behavior the user reports.";
/**
 * Add more question/result pairs to the REPLY_CHECKS array as needed.
 * skipsListedTasks: the check is skipped when every task number in the reply is an open task, and Haiku sees the open tasks.
 */
type ReplyCheck = { question: string; result: string; skipsListedTasks?: boolean };
const REPLY_CHECKS: ReplyCheck[] = [
  { question: 'a bug report', result: BUG_REPORT_TEXT, skipsListedTasks: true },
  { question: 'a question or choice for the user', result: QUESTION_OR_CHOICE_TEXT },
  { question: 'incomplete or unstarted work', result: UNFINISHED_WORK_TEXT, skipsListedTasks: true },
];

async function parseDefaultFile($: EngineInterface): Promise<{ enablements: Record<string, Record<string, boolean>>; values?: Record<string, Record<string, string>> }> {
  return JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCHER_DIR}/dispatch.json`));
}

async function parseUserFile($: EngineInterface): Promise<{ enablements: Record<string, Record<string, boolean>>; values?: Record<string, Record<string, string>> } | undefined> {
  const userPath = `${$.plugin.root}/${DISPATCHER_DIR}/user-dispatch.json`;
  const hasUserFile = await $.fs.exists(userPath);
  if (!hasUserFile)
    return undefined;
  return JSON.parse(await $.fs.read(userPath));
}

function getEnablement(file: { enablements: Record<string, Record<string, boolean>> }, pluginName: string, event: string): boolean | undefined {
  return file.enablements[pluginName]?.[event];
}

async function readDefault($: EngineInterface, pluginName: string, event: string): Promise<boolean> {
  const defaults = await parseDefaultFile($);
  const defaultValue = getEnablement(defaults, pluginName, event);
  if (defaultValue === undefined)
    throw new Error(`dispatch.json has no enablement for ${pluginName} ${event}`);
  return defaultValue;
}

async function readUser($: EngineInterface, pluginName: string, event: string): Promise<boolean | undefined> {
  const user = await parseUserFile($);
  if (user === undefined)
    return undefined;
  return getEnablement(user, pluginName, event);
}

async function isEventEnabled($: EngineInterface, pluginName: string, event: string): Promise<boolean> {
  const userValue = await readUser($, pluginName, event);
  if (userValue !== undefined)
    return userValue;
  return await readDefault($, pluginName, event);
}

// async function isReplyAnswerYes($: EngineInterface, answer: string, query: string): Promise<boolean> {
//   const prompt = `Is ${query} written in this message?\n\nAnswer with the single word yes or no.\n\nThe message:\n${answer}`;
//   const reply = await $.model.complete({ model: CHECKER_MODEL, prompt, timeoutMs: CHECKER_TIMEOUT_MS });
//   if (!reply.isAnswered)
//     throw new Error(`ask-dont-dump: the checker gave no answer: ${reply.reason}`);
//   const answerWord = reply.text.trim().toLowerCase();
//   return answerWord.startsWith('yes');
// }
async function isReplyAnswerYes($: EngineInterface, answer: string, check: ReplyCheck, openTasks: OpenTask[]): Promise<boolean> {
  let prompt = `Is ${check.question} written in this message?\n\nAnswer with the single word yes or no.\n\nThe message:\n${answer}`;
  if (check.skipsListedTasks)
    prompt = `Is ${check.question} that is not on this task list written in this message?\n\nAnswer with the single word yes or no.\n\nThe task list:\n${formatOpenTasks(openTasks)}\n\nThe message:\n${answer}`;
  const reply = await $.model.complete({ model: CHECKER_MODEL, prompt, timeoutMs: CHECKER_TIMEOUT_MS });
  if (!reply.isAnswered)
    throw new Error(`ask-dont-dump: the checker gave no answer: ${reply.reason}`);
  const answerWord = reply.text.trim().toLowerCase();
  return answerWord.startsWith('yes');
}

// async function getNudgeTexts($: EngineInterface, answer: string): Promise<string[]> {
//   const pending: Promise<boolean>[] = [];
//   for (const check of REPLY_CHECKS)
//     pending.push(isReplyAnswerYes($, answer, check.question));
//   const answers = await Promise.all(pending);
//   const nudges: string[] = [];
//   for (const [i, check] of REPLY_CHECKS.entries()) {
//     if (answers[i])
//       nudges.push(check.result);
//   }
//   return nudges;
// }
async function getNudgeTexts($: EngineInterface, answer: string): Promise<string[]> {
  const openTasks = await loadOpenTasks($);
  const isTaskMentioned = isEveryTaskNumberOpen(answer, openTasks);
  const askedChecks: ReplyCheck[] = [];
  const pending: Promise<boolean>[] = [];
  for (const check of REPLY_CHECKS) {
    const isSkipped = check.skipsListedTasks === true && isTaskMentioned;
    if (isSkipped)
      continue;
    askedChecks.push(check);
    pending.push(isReplyAnswerYes($, answer, check, openTasks));
  }
  const answers = await Promise.all(pending);
  const nudges: string[] = [];
  for (const [i, check] of askedChecks.entries()) {
    if (answers[i])
      nudges.push(check.result);
  }
  return nudges;
}

let isAnsweringCheckerReason = false;

const setCheckerReasonFlagOnPrompt: Hook<'prompt.submit'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'prompt.submit');
  if (!enabled)
    return next(e);
  const isPluginOrigin = e.origin.kind === 'plugin';
  if (!isPluginOrigin) {
    isAnsweringCheckerReason = false;
    return next(e);
  }
  isAnsweringCheckerReason = e.origin.name === PLUGIN_NAME;
  return next(e);
};

const validateReplyBeforeStop: Hook<'turn.complete'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'turn.complete');
  if (!enabled)
    return next(e);
  if (e.agentId !== undefined)
    return next(e);
  if (e.reason !== 'answer')
    return next(e);
  if (isAnsweringCheckerReason)
    return next(e);

  const nudges = await getNudgeTexts($, e.answer);
  if (nudges.length === 0)
    return next(e);
  void $.prompt.submit({ text: nudges.join('\n\n') });
  return next(e);
};

export const register: Register = on => {
  on('prompt.submit', setCheckerReasonFlagOnPrompt);
  on('turn.complete', validateReplyBeforeStop);
};
