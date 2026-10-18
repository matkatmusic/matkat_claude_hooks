import type { Register, Hook } from 'claude-code';

const CHECKER_MODEL = 'claude-haiku-5-5';
const CHECKER_TIMEOUT_MS = 30 * 1000;
const PLUGIN_NAME = 'ask-dont-dump';
const RUBRIC_FILE_NAME = 'ask-dont-dump-prompt.md';
const ARGUMENTS_PLACEHOLDER = '$ARGUMENTS';
const DISPATCH_FILE_PATH = '../../dispatcher/dispatch.json';

let isAnsweringCheckerReason = false;

const setCheckerReasonFlagOnPrompt: Hook<'prompt.submit'> = ($, e, next) => {
  const isPluginOrigin = e.origin.kind === 'plugin';
  if (!isPluginOrigin) {
    isAnsweringCheckerReason = false;
    return next(e);
  }
  isAnsweringCheckerReason = e.origin.name === PLUGIN_NAME;
  return next(e);
};

const validateReplyBeforeStop: Hook<'turn.complete'> = async ($, e, next) => {
  if (e.agentId !== undefined)
    return next(e);
  if (e.reason !== 'answer')
    return next(e);
  const dispatchEntries = JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCH_FILE_PATH}`));
  for (const dispatchEntry of dispatchEntries) {
    const isThisMod = dispatchEntry.name === PLUGIN_NAME;
    if (!isThisMod)
      continue;
    const isDisabled = dispatchEntry.enabled === false;
    if (isDisabled)
      return next(e);
  }
  const rubric =await $.fs.read(`${$.plugin.root}/${RUBRIC_FILE_NAME}`);
  const hookInput = JSON.stringify({ last_assistant_message: e.answer, stop_hook_active: isAnsweringCheckerReason });
  const checkerPrompt = rubric.split(ARGUMENTS_PLACEHOLDER).join(hookInput);
  const reply = await $.model.complete({ model: CHECKER_MODEL, prompt: checkerPrompt, timeoutMs: CHECKER_TIMEOUT_MS });
  if (!reply.isAnswered)
    throw new Error(`ask-dont-dump: the checker gave no answer: ${reply.reason}`);
  const verdict = JSON.parse(reply.text);
  if (verdict.ok)
    return next(e);
  void $.prompt.submit({ text: verdict.reason });
  return next(e);
};

export const register: Register = on => {
  on('prompt.submit', setCheckerReasonFlagOnPrompt);
  on('turn.complete', validateReplyBeforeStop);
};
