import type { Register, Hook, EngineInterface } from 'claude-code';
import { loadOpenTasks, isEveryTaskNumberOpen, formatOpenTasks, type OpenTask } from './taskList';
import { loadEarlierAnswers, formatEarlierAnswers, type EarlierAnswer } from './earlierAnswers';
import { logAndRethrowHookFailure } from './logHookFailure';
import { parseYesPhrase, removeNudgeFile, writeNudgeFile, type FlaggedCheck } from './nudgeFile';
const ANSWER_FORMAT_LINE = 'Answer no, or answer yes followed by the exact sentence from the message that made you say yes.';
const CHECKER_MODEL = 'claude-haiku-5-5';
const CHECKER_TIMEOUT_MS = 30 * 1000;
const PLUGIN_NAME = 'ask-dont-dump';
const DISPATCHER_DIR = '../../dispatcher';

/**
 * Add more question/result pairs to the REPLY_CHECKS array as needed.
 * skipsListedTasks: the check is skipped when every task number in the reply is an open task, and Haiku sees the open tasks.
 */
export type ReplyCheck = { question: string; correction: string; did: string; do: string; skipsListedTasks?: boolean; name?: string; footnote?: string };
export const REPLY_CHECKS: ReplyCheck[] = [
  {
    question: 'a bug report',
    correction: "Your last message reported a bug. Create a task in the session task list with TaskCreate to track the bug's resolution. Write a regression test that reproduces the buggy behavior and proves the fix works.",
    did: 'Reported a bug',
    do: "Create a task with TaskCreate to track the bug's fix, and write a regression test.",
    skipsListedTasks: true,
  },
  {
    question: 'a question or choice for the user',
    correction: 'Your last message has at least one question or choice for the user. Use AskUserQuestion to have the user make a decision for each question or choice item in the message.',
    did: 'Asked the user a question or gave a choice',
    do: 'Use AskUserQuestion for each question or choice.',
    footnote: 'a status sentence about who decides, or when a helper or another chat does queued work (for example "You decide when it does the work."), does not count when it asks nothing.',
  },
  // { question: 'incomplete or unstarted work', result: UNFINISHED_WORK_TEXT, skipsListedTasks: true },
  {
    name: 'Declaring Unfinished Work',
    question: 'a statement that requested/completed work is not finished/started',
    correction: 'Your last message mentioned incomplete or unstarted work.',
    did: 'Declared unfinished work',
    do: 'Use TaskCreate to track the work.',
    skipsListedTasks: true,
    footnote: 'a question asking permission to start work does not count as Declaring Unfinished Work. A description of missing functionality does not count as Declaring Unfinished Work. A sentence that only reports that a helper, subagent or another chat is working on something, or has made no change yet, does not count as Declaring Unfinished Work. A sentence that only says code or changes wait for a commit does not count as Declaring Unfinished Work.',
  },
  {
    name: 'Repo-state Claim',
    question: 'a statement of fact about the git repository itself, such as which files, commits, branches, or changes exist',
    correction: "Your last message made a claim about the repository state.",
    did: 'Made a repo-state claim',
    do: 'Confirm your claim before telling the user about the repository state',
    footnote: 'a question about the repo does not count as a Repo-state Claim.  a statement about what the code does or lacks does not count as a Repo-State Claim.',
  },
  // { question: 'an open or incomplete task', result: INCOMPLETE_TASK_TEXT },
  {
    name: 'Declaring Open Task',
    question: 'a named task (e.g. #12) claimed to be still open or incomplete',
    correction: 'Your last message named an incomplete task.',
    did: 'Declared an open task',
    do: 'Confirm against the codebase if the task is actually incomplete. If the task is completed, mark the task as Completed. Otherwise, decide if the task stops progress toward the current goal. If yes, use AskUserQuestion to ask the user if they want to tackle that task now. If no, leave it on the task list.',
    footnote: 'a question about starting tasks or specific work does not count as a Declaring Open Task. A sentence that only says a helper or subagent is running or working on a task does not count as a Declaring Open Task, because someone already works on it.',
  },
  {
    name: 'Describing Missing Functionality',
    question: 'a description of functionality that is missing from the codebase',
    correction: 'Your last message describes functionality that is missing.',
    did: 'Described missing functionality',
    do: 'Decide if the missing functionality stops progress toward the current goal. If yes, use AskUserQuestion to ask the user if they want it built now. If no, record it as a task with TaskCreate, a source code comment, or a note in a markdown file.',
    footnote: "a description that answers the user's earlier question of if the code can do something counts as Describing Missing Functionality.",
  },
];

async function parseDefaultFile($: EngineInterface): Promise<{ enablements: Record<string, Record<string, boolean>>; values?: Record<string, Record<string, string | boolean>> }> {
  return JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCHER_DIR}/dispatch.json`));
}

async function parseUserFile($: EngineInterface): Promise<{ enablements: Record<string, Record<string, boolean>>; values?: Record<string, Record<string, string | boolean>> } | undefined> {
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

function getValue(file: { values?: Record<string, Record<string, string | boolean>> }, section: string, key: string): string | boolean | undefined {
  return file.values?.[section]?.[key];
}

async function readValue($: EngineInterface, section: string, key: string): Promise<string | boolean> {
  const user = await parseUserFile($);
  if (user !== undefined) {
    const userValue = getValue(user, section, key);
    if (userValue !== undefined)
      return userValue;
  }
  const defaults = await parseDefaultFile($);
  const defaultValue = getValue(defaults, section, key);
  if (defaultValue === undefined)
    throw new Error(`dispatch.json has no value for ${section} ${key}`);
  return defaultValue;
}

function buildQuestionLinePreamble(check: ReplyCheck): string {
  const hasName = check.name !== undefined;
  if (hasName)
    return `You are checking for ${check.name}.  `;

  return '';
}

function buildQuestionLine(check: ReplyCheck): string {
  let questionLine = buildQuestionLinePreamble(check);
  // questionLine += `Is ${check.question} `;
  questionLine += `Is ${check.question}`;

  if (check.skipsListedTasks)
    questionLine += ' that is not on this task list';

  questionLine += ' written in this message?';

  if (check.footnote)
    questionLine += ` ${check.footnote}`;

  return questionLine;
}

function buildPrompt(check: ReplyCheck, answer: string, openTasks: OpenTask[], earlierAnswers: EarlierAnswer[]): string {
  const questionLine = buildQuestionLine(check);
  let prompt = `${questionLine}\n\n${ANSWER_FORMAT_LINE}\n\n`;

  if (check.skipsListedTasks)
    // prompt += `\n\nThe task list:\n${formatOpenTasks(openTasks)}\n\n`;
    prompt += `The task list:\n${formatOpenTasks(openTasks)}\n\n`;

  const hasEarlierAnswers = earlierAnswers.length > 0;
  if (hasEarlierAnswers)
    prompt += `The user already answered these questions in this chat. Do not flag an item that one of these answers already settled:\n${formatEarlierAnswers(earlierAnswers)}\n\n`;

  prompt += `The message:\n${answer}`;
  return prompt;
}

async function getReplyPhrase($: EngineInterface, answer: string, check: ReplyCheck, openTasks: OpenTask[], earlierAnswers: EarlierAnswer[]): Promise<string> {
  const prompt = buildPrompt(check, answer, openTasks, earlierAnswers);
  const reply = await $.model.complete({ model: CHECKER_MODEL, prompt, timeoutMs: CHECKER_TIMEOUT_MS });
  if (!reply.isAnswered)
    throw new Error(`ask-dont-dump: the checker gave no answer: ${reply.reason}`);

  return parseYesPhrase(reply.text, answer);
}

async function collectFlaggedChecks($: EngineInterface, answer: string): Promise<FlaggedCheck[]> {
  const openTasks = await loadOpenTasks($);
  const earlierAnswers = await loadEarlierAnswers($);
  const isTaskMentioned = isEveryTaskNumberOpen(answer, openTasks);
  const askedChecks: ReplyCheck[] = [];
  const pending: Promise<string>[] = [];
  for (const check of REPLY_CHECKS) {
    const isSkipped = check.skipsListedTasks === true && isTaskMentioned;
    if (isSkipped)
      continue;
    askedChecks.push(check);
    pending.push(getReplyPhrase($, answer, check, openTasks, earlierAnswers));
  }
  const phrases = await Promise.all(pending);
  const flagged: FlaggedCheck[] = [];
  for (const [i, check] of askedChecks.entries()) {
    const phrase = phrases[i];
    const isFlagged = phrase !== undefined && phrase !== '';
    if (!isFlagged)
      continue;
    flagged.push({ did: check.did, do: check.do, proof: phrase });
  }
  return flagged;
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

  const useTypesafe = await readValue($, PLUGIN_NAME, 'useTypesafe');
  const isTypesafeOn = useTypesafe === true;
  if (isTypesafeOn)
    throw new Error('ask-dont-dump: useTypesafe is true, but TypeSafe checks are not built yet');
  const flagged = await collectFlaggedChecks($, e.answer);
  const isAnyFlagged = flagged.length > 0;
  if (!isAnyFlagged)
    return next(e);
  const nudgePath = await writeNudgeFile($, flagged);
  // void $.prompt.submit({ text: `ask-dont-dump flagged your last reply. Read ${nudgePath} and do each item in its "do" list.` });
  void $.prompt.submit({ text: `ask-dont-dump flagged your last reply. Read ${nudgePath} and do each item's "do" field.` });
  return next(e);
};

const removeNudgeFileOnSessionEnd: Hook<'session.end'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'session.end');
  if (!enabled)
    return next(e);
  await removeNudgeFile($, e.sessionId);
  return next(e);
};

export const register: Register = on => {
  on('prompt.submit', setCheckerReasonFlagOnPrompt).catch(logAndRethrowHookFailure);
  on('turn.complete', validateReplyBeforeStop).catch(logAndRethrowHookFailure);
  on('session.end', removeNudgeFileOnSessionEnd).catch(logAndRethrowHookFailure);
};
