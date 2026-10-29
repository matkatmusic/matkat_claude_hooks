import type { Register, Hook, EngineInterface } from 'claude-code';
import { logAndRethrowHookFailure } from './logHookFailure';

const PLUGIN_NAME = 'context-exit';
const WARNING_PERCENTS_KEY = 'CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS';
// const WARNING_PERCENTS = [30, 50, 80];
const TOAST_MS = 60000;
const DISPATCHER_DIR = '../../dispatcher';

const warnedPercentRef = { plugin: 'context-exit', key: 'warnedPercent' } as const;

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

const reportContextUsageOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'turn.complete');
  if (!enabled)
    return next(e);
  const usage = await $.session.usage();
  const percent = usage.context.percent;
  if (percent === undefined)
    return next(e);
  const { value: warnedPercent = 0 } = await $.state.get(warnedPercentRef);
  const percentsText = await readValue($, PLUGIN_NAME, WARNING_PERCENTS_KEY);
  let crossedPercent = 0;
  for (const warningPercentText of percentsText.split(',')) {
    const warningPercent = Number(warningPercentText);
    if (percent >= warningPercent)
      crossedPercent = warningPercent;
  }
  const isNewLevel = crossedPercent > warnedPercent;
  if (!isNewLevel)
    return next(e);
  await $.state.set(warnedPercentRef, crossedPercent);
  const message = `Performance degrades after context goes above ${crossedPercent}%. Consider exiting the session and starting a new one. Run /matkat-hooks:handoff-state to hand off.`;
  $.ui.toast(message, { timeoutMs: TOAST_MS });
  $.ui.status(message);
  return next(e);
};

export const register: Register = on => {
  on('turn.complete', reportContextUsageOnTurnComplete).catch(logAndRethrowHookFailure);
};
