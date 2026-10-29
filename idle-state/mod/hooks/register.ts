import type { Register, Hook, EngineInterface } from 'claude-code';
import { PLUGIN_NAME, IDLE_MINUTES_KEY, idleState, clearState } from './idleStateShared';
import { sendStatePrompt, scheduleStatePrompt, writeStateFileAndExit } from './stateWriting';
import { logAndRethrowHookFailure } from './logHookFailure';
const DISPATCHER_DIR = '../../dispatcher';
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

function getValue(file: { values?: Record<string, Record<string, string>> }, section: string, key: string): string | undefined {
  return file.values?.[section]?.[key];
}

async function readValue($: EngineInterface, section: string, key: string): Promise<string> {
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

const clearStateOnSessionStart: Hook<'session.start'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'session.start');
  if (!enabled)
    return next(e);
  return clearState($, e, next);
};

const clearStateOnSessionEnd: Hook<'session.end'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'session.end');
  if (!enabled)
    return next(e);
  return clearState($, e, next);
};

const blockPromptAfterStateSaved: Hook<'prompt.submit'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'prompt.submit');
  if (!enabled)
    return next(e);
  idleState.idleTimer?.cancel();
  if (idleState.stateFilePath === undefined) {
    const isUserPromptDuringStateWrite = idleState.isWritingState && !e.text.includes(idleState.statePrompt);
    if (isUserPromptDuringStateWrite)
      idleState.isWritingState = false;
    return next(e);
  }
  return { drop: `The chat cache has expired. You should exit this chat. Start a new chat and run /catch-up.` };
};

const denyToolsWhileStatePromptPending: Hook<'tool.call'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'tool.call');
  if (!enabled)
    return next(e);
  if (!idleState.isWritingState)
    return next(e);
  return { deny: 'The idle-state prompt is pending. Do not use any tools.' };
};

const blockStopHooksWhileStatePromptPending: Hook<'classic.Stop'> = async ($, e, next) => {
  if (!idleState.isWritingState)
    return next(e);
  return {};
};

const blockSubagentStopHooksWhileStatePromptPending: Hook<'classic.SubagentStop'> = async ($, e, next) => {
  if (!idleState.isWritingState)
    return next(e);
  return {};
};

const updateIdleStateOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'turn.complete');
  if (!enabled)
    return next(e);
  if (e.agentId !== undefined)
    return next(e);
  idleState.idleTimer?.cancel();
  if (idleState.isWritingState) {
    await writeStateFileAndExit($, e.isAborted);
    return next(e);
  }
  const idleMinutes = Number(await readValue($, PLUGIN_NAME, IDLE_MINUTES_KEY));
  await scheduleStatePrompt($, idleMinutes);
  return next(e);
};

const writeIdleStateBeforeExit: Hook<'command.run'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'command.run');
  if (!enabled)
    return next(e);
  if (idleState.stateFilePath !== undefined)
    return next(e);
  idleState.idleTimer?.cancel();
  function sendStatePromptNow() {
    return sendStatePrompt($);
  }
  $.clock.after(0, sendStatePromptNow);
  return { text: 'Writing the idle-state file before exit.' };
};

export const register: Register = on => {
  on('session.start', clearStateOnSessionStart).catch(logAndRethrowHookFailure);
  on('session.end', clearStateOnSessionEnd).catch(logAndRethrowHookFailure);
  on('prompt.submit', blockPromptAfterStateSaved).catch(logAndRethrowHookFailure);
  on('turn.complete', updateIdleStateOnTurnComplete).catch(logAndRethrowHookFailure);
  on('tool.call', denyToolsWhileStatePromptPending).catch(logAndRethrowHookFailure);
  on('classic.Stop', blockStopHooksWhileStatePromptPending).catch(logAndRethrowHookFailure);
  on('classic.SubagentStop', blockSubagentStopHooksWhileStatePromptPending).catch(logAndRethrowHookFailure);
  on('command.run', { command: 'exit' }, writeIdleStateBeforeExit).catch(logAndRethrowHookFailure);
};
