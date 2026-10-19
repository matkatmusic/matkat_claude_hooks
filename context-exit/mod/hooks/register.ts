import type { Register, Hook, EngineInterface } from 'claude-code';

const PLUGIN_NAME = 'context-exit';
const WARNING_PERCENTS = [30, 50, 80];
const TOAST_MS = 60000;
const DISPATCHER_DIR = '../../dispatcher';

const warnedPercentRef = { plugin: 'context-exit', key: 'warnedPercent' } as const;

async function isEventEnabled($: EngineInterface, pluginName: string, event: string): Promise<boolean> {
  const defaults = JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCHER_DIR}/dispatch.json`));
  const userPath = `${$.plugin.root}/${DISPATCHER_DIR}/user-dispatch.json`;
  const hasUserFile = await $.fs.exists(userPath);
  let user: { enablements: Record<string, Record<string, boolean>> } = { enablements: {} };
  if (hasUserFile)
    user = JSON.parse(await $.fs.read(userPath));
  const userValue = user.enablements[pluginName]?.[event];
  if (userValue !== undefined)
    return userValue;
  const defaultValue = defaults.enablements[pluginName]?.[event];
  if (defaultValue === undefined)
    throw new Error(`dispatch.json has no enablement for ${pluginName} ${event}`);
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
  let crossedPercent = 0;
  for (const warningPercent of WARNING_PERCENTS) {
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
  on('turn.complete', reportContextUsageOnTurnComplete);
};
