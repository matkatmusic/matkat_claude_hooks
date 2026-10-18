import type { Register, Hook } from 'claude-code';

const WARNING_PERCENTS = [30, 50, 80];
const TOAST_MS = 60000;

const warnedPercentRef = { plugin: 'context-exit', key: 'warnedPercent' } as const;

const reportContextUsageOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
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
