import type { Register } from 'claude-code';

let warned = false;

export const register: Register = on => {
  on('turn.complete', async ($, e, next) => {
    const usage = await $.session.usage();
    const percent = usage.context.percent;
    if (percent === undefined)
      return next(e);
    const limitText = await $.env.get('CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT');
    if (limitText === undefined)
      throw new Error('context-exit: set CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT in the Claude process environment');
    const limit = Number(limitText);
    const isOverLimit = percent >= limit;
    if (!isOverLimit)
      return next(e);
    if (warned)
      return next(e);
    warned = true;
    $.ui.toast(`Performance degrades after context goes above ${limit}%. Consider exiting the session and starting a new one. Run /matkat-hooks:handoff-state to hand off.`);
    return next(e);
  });
};
