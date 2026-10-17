import type { Register } from 'claude-code';

const LIMIT_PERCENT = 30;

let warned = false;

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const usage = await $.session.usage();
    const percent = usage.context.percent;
    if (percent === undefined)
      return next(e);
    const isOverLimit = percent >= LIMIT_PERCENT;
    if (!isOverLimit)
      return next(e);
    if (warned)
      return next(e);
    warned = true;
    $.ui.toast(`Performance degrades after context goes above ${LIMIT_PERCENT}%. Consider exiting the session and starting a new one. Run /matkat-hooks:handoff-state to hand off.`);
    return next(e);
  });
};
