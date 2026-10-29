import type { Register, Hook, PromptSubmitInput, EngineInterface } from 'claude-code';
import { logAndRethrowHookFailure } from './logHookFailure';

const CLASSIFIER_MODEL = 'claude-haiku-5-5';
const CLASSIFIER_TIMEOUT_MS = 30 * 1000;
const DISPATCHER_DIR = '../../dispatcher';

const BUG_REPORT_TEXT = "The user is reporting a bug. Create a task in the session task list with TaskCreate to track the bug's resolution. Write a regression test for the behavior the user reports.";
const FEATURE_REQUEST_TEXT = 'The user is stating a feature request. Create a task in the session task list with TaskCreate to track it. If the request is ambiguous, use AskUserQuestion first to clarify what the user wants and align on the exact want.';
const CHANGE_REQUEST_TEXT = 'The user is describing a change in functionality. Create a task in the session task list with TaskCreate to track the change. If the description is ambiguous or vague, use AskUserQuestion first to clarify what the user wants and align on the exact want.';

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

// async function isTypedPromptAnswerYes($: EngineInterface, e: PromptSubmitInput, pluginName: string, question: string): Promise<boolean> {
//   const enabled = await isEventEnabled($, pluginName, 'prompt.submit');
//   if (!enabled)
//     return false;
//   if (e.command !== undefined)
//     return false;
//   const isTypedByPerson = e.origin.kind === 'composer';
//   if (!isTypedByPerson)
//     return false;
//   const prompt = `${question}\n\nAnswer with the single word yes or no.\n\nThe user's prompt:\n${e.text}`;
//   const reply = await $.model.complete({ model: CLASSIFIER_MODEL, prompt, timeoutMs: CLASSIFIER_TIMEOUT_MS });
//   if (!reply.isAnswered)
//     throw new Error(`${pluginName}: the classifier gave no answer: ${reply.reason}`);
//   const answer = reply.text.trim().toLowerCase();
//   return answer.startsWith('yes');
// }

async function getFlaggedItems($: EngineInterface, e: PromptSubmitInput, pluginName: string, question: string): Promise<string[]> {
  const enabled = await isEventEnabled($, pluginName, 'prompt.submit');
  if (!enabled)
    return [];
  if (e.command !== undefined)
    return [];
  const isTypedByPerson = e.origin.kind === 'composer';
  if (!isTypedByPerson)
    return [];
  const prompt = `${question}\n\nReply with only JSON. If yes, reply {"yes": [...]} with one string for each item you find, any number of items. Each string is the first 5 words of the line or sentence that holds that item. If no, reply {"no": []}.\n\nThe user's prompt:\n${e.text}`;
  const startedAt = await $.clock.now();
  const reply = await $.model.complete({ model: CLASSIFIER_MODEL, prompt, timeoutMs: CLASSIFIER_TIMEOUT_MS });
  const elapsedMs = (await $.clock.now()) - startedAt;
  if (!reply.isAnswered)
    throw new Error(`${pluginName}: the classifier gave no answer: ${reply.reason} after ${elapsedMs} ms`);
  const replyJson = reply.text.slice(reply.text.indexOf('{'), reply.text.lastIndexOf('}') + 1);
  const parsed: { yes?: string[]; no?: string[] } = JSON.parse(replyJson);
  if (parsed.no !== undefined)
    return [];
  if (parsed.yes === undefined)
    throw new Error(`${pluginName}: the classifier reply has no "yes" or "no" key: ${reply.text}`);
  return parsed.yes;
}

async function getBugReportContext($: EngineInterface, e: PromptSubmitInput): Promise<string | undefined> {
  const items = await getFlaggedItems($, e, 'bug-report', 'Is the user reporting a bug?');
  if (items.length === 0)
    return undefined;
  return `${BUG_REPORT_TEXT} Flagged items (first 5 words): ${JSON.stringify(items)}. Create one task for each item.`;
}

async function getFeatureRequestContext($: EngineInterface, e: PromptSubmitInput): Promise<string | undefined> {
  const items = await getFlaggedItems($, e, 'feature-request', 'Is the user stating a feature request?');
  if (items.length === 0)
    return undefined;
  return `${FEATURE_REQUEST_TEXT} Flagged items (first 5 words): ${JSON.stringify(items)}. Create one task for each item.`;
}

async function getChangeRequestContext($: EngineInterface, e: PromptSubmitInput): Promise<string | undefined> {
  const items = await getFlaggedItems($, e, 'change-request', 'Is the user describing a change they want in the functionality of the tool?');
  if (items.length === 0)
    return undefined;
  return `${CHANGE_REQUEST_TEXT} Flagged items (first 5 words): ${JSON.stringify(items)}. Create one task for each item.`;
}

// The engine allows one unmatched prompt.submit hook per plugin, so this one runs all three checks.
const addIntentContext: Hook<'prompt.submit'> = async ($, e, next) => {
  const found = await Promise.all([getBugReportContext($, e), getFeatureRequestContext($, e), getChangeRequestContext($, e)]);
  const added: string[] = [];
  for (const text of found) {
    if (text !== undefined)
      added.push(text);
  }
  if (added.length === 0)
    return next(e);
  return next({ ...e, context: [...(e.context ?? []), ...added] });
};

export const register: Register = on => {
  on('prompt.submit', addIntentContext).catch(logAndRethrowHookFailure);
};
