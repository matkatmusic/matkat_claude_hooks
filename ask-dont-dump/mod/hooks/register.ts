import type { Register, Hook, EngineInterface } from 'claude-code';

const CHECKER_MODEL = 'claude-haiku-5-5';
const CHECKER_TIMEOUT_MS = 30 * 1000;
const PLUGIN_NAME = 'ask-dont-dump';
const RUBRIC_FILE_NAME = 'ask-dont-dump-prompt.md';
const ARGUMENTS_PLACEHOLDER = '$ARGUMENTS';
const DISPATCHER_DIR = '../../dispatcher';

async function readDefault($: EngineInterface, pluginName: string, event: string): Promise<boolean> {
  const defaults = JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCHER_DIR}/dispatch.json`));
  const defaultValue = defaults.enablements[pluginName]?.[event];
  if (defaultValue === undefined)
    throw new Error(`dispatch.json has no enablement for ${pluginName} ${event}`);
  return defaultValue;
}

async function readUser($: EngineInterface, pluginName: string, event: string): Promise<boolean | undefined> {
  const userPath = `${$.plugin.root}/${DISPATCHER_DIR}/user-dispatch.json`;
  const hasUserFile = await $.fs.exists(userPath);
  if (!hasUserFile)
    return undefined;
  const user: { enablements: Record<string, Record<string, boolean>> } = JSON.parse(await $.fs.read(userPath));
  return user.enablements[pluginName]?.[event];
}

async function isEventEnabled($: EngineInterface, pluginName: string, event: string): Promise<boolean> {
  const userValue = await readUser($, pluginName, event);
  if (userValue !== undefined)
    return userValue;
  return await readDefault($, pluginName, event);
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

  const rubric = await $.fs.read(`${$.plugin.root}/${RUBRIC_FILE_NAME}`);
  const hookInput = JSON.stringify({ last_assistant_message: e.answer, stop_hook_active: isAnsweringCheckerReason });
  const checkerPrompt = rubric.split(ARGUMENTS_PLACEHOLDER).join(hookInput);
  const reply = await $.model.complete({ model: CHECKER_MODEL, prompt: checkerPrompt, timeoutMs: CHECKER_TIMEOUT_MS });
  if (!reply.isAnswered)
    throw new Error(`ask-dont-dump: the checker gave no answer: ${reply.reason}`);
  const verdictJson = reply.text.slice(reply.text.indexOf('{'), reply.text.lastIndexOf('}') + 1);
  const verdict = JSON.parse(verdictJson);
  if (verdict.ok)
    return next(e);
  void $.prompt.submit({ text: verdict.reason });
  return next(e);
};

export const register: Register = on => {
  on('prompt.submit', setCheckerReasonFlagOnPrompt);
  on('turn.complete', validateReplyBeforeStop);
};
