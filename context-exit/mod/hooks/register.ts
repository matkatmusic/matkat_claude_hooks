import type { Register, Hook, EngineInterface } from 'claude-code';
import { logAndRethrowHookFailure, wrapNextForDebugLog } from './logHookFailure';

const PLUGIN_NAME = 'context-exit';
const WARNING_PERCENTS_KEY = 'CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS';
const TOAST_MS = 60000;
const DISPATCHER_DIR = '../../dispatcher';

const SWAP_PERCENT_KEY = 'CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT';

const warnedPercentRef = { plugin: 'context-exit', key: 'warnedPercent' } as const;
const isSwapStartedRef = { plugin: 'context-exit', key: 'isSwapStarted' } as const;

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

export function isSwapDue(input: { teamName: string | undefined; percent: number | undefined; swapPercent: number; backgroundTaskCount: number; isSwapStarted: boolean }): boolean {
  if (input.teamName === undefined)
    return false;
  if (input.percent === undefined)
    return false;
  if (input.percent < input.swapPercent)
    return false;
  if (input.backgroundTaskCount > 0)
    return false;
  if (input.isSwapStarted)
    return false;
  return true;
}

const handoffTurn = { isActive: false };

async function getStopHooksOffMarkerPath($: EngineInterface): Promise<string> {
  const sessionId = await $.session.id();
  return `${$.plugin.root}/${DISPATCHER_DIR}/stop-hooks-off/${sessionId}`;
}

const turnOffStopHooksOnHandoffPrompt: Hook<'prompt.submit'> = async ($, e, next) => {
  const isShortHandoffPrompt = e.text.startsWith('/handoff-state');
  const isLongHandoffPrompt = e.text.startsWith('/matkat-hooks:handoff-state');
  const isHandoffPrompt = isShortHandoffPrompt || isLongHandoffPrompt;
  if (!isHandoffPrompt)
    return next(e);
  await $.fs.write(await getStopHooksOffMarkerPath($), '');
  handoffTurn.isActive = true;
  return next(e);
};

const reportContextUsageOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
  const isMainTurn = e.agentId === undefined;
  if (isMainTurn && handoffTurn.isActive) {
    handoffTurn.isActive = false;
    await $.process.run(['rm', '-f', await getStopHooksOffMarkerPath($)]);
  }
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
  for (const warningPercentText of String(percentsText).split(',')) {
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

function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

const startSwapOnStop: Hook<'classic.Stop'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'classic.Stop');
  if (!enabled)
    return next(e);
  const teamName = await $.env.get('CLAUDE_TEAM_NAME');
  const job = await $.env.get('CLAUDE_TEAM_JOB');
  const chatName = await $.env.get('CLAUDE_TEAM_CHAT_NAME');
  const usage = await $.session.usage();
  const swapPercent = Number(await readValue($, PLUGIN_NAME, SWAP_PERCENT_KEY));
  const backgroundTaskCount = (e.background_tasks ?? []).length;
  const { value: isSwapStarted = false } = await $.state.get(isSwapStartedRef);
  const isDue = isSwapDue({ teamName, percent: usage.context.percent, swapPercent, backgroundTaskCount, isSwapStarted });
  if (!isDue)
    return next(e);
  await $.state.set(isSwapStartedRef, true);
  const scriptFolder = `${$.plugin.root}/../../claude-team`;
  const logPath = `${$.plugin.root}/${DISPATCHER_DIR}/claude-team-swap.log`;
  const swapArguments = `${wrapShellWord(teamName!)} ${wrapShellWord(job!)} ${wrapShellWord(chatName!)}`;
  const sessionId = await $.session.id();
  const swapCommand = `bun ${scriptFolder}/swapChat.ts ${swapArguments} ${wrapShellWord(sessionId)} >> ${logPath} 2>&1`;
  const failedCommand = `bun ${scriptFolder}/swapFailed.ts ${swapArguments} ${wrapShellWord(sessionId)} >> ${logPath} 2>&1`;
  const result = await $.process.run(['tmux', 'run-shell', '-b', `${swapCommand} || ${failedCommand}`]);
  if (result.exitCode !== 0)
    throw new Error(`tmux run-shell failed: ${result.stderr}`);
  return next(e);
};

const startSwapOnStopWithDebugLog: Hook<'classic.Stop'> = async ($, e, next) => {
  const debugLog = await wrapNextForDebugLog($, 'startSwapOnStop', 'classic.Stop', e, next);
  const returned = await startSwapOnStop($, e, debugLog.next);
  await debugLog.finish(returned);
  return returned;
};

const logTurnOffStopHooksOnHandoffPrompt: Hook<'prompt.submit'> = async ($, e, next) => {
  const debugLog = await wrapNextForDebugLog($, 'turnOffStopHooksOnHandoffPrompt', 'prompt.submit', e, next);
  const returned = await turnOffStopHooksOnHandoffPrompt($, e, debugLog.next);
  await debugLog.finish(returned);
  return returned;
};

const reportContextUsageOnTurnCompleteWithDebugLog: Hook<'turn.complete'> = async ($, e, next) => {
  const debugLog = await wrapNextForDebugLog($, 'reportContextUsageOnTurnComplete', 'turn.complete', e, next);
  const returned = await reportContextUsageOnTurnComplete($, e, debugLog.next);
  await debugLog.finish(returned);
  return returned;
};

export const register: Register = on => {
  on('prompt.submit', logTurnOffStopHooksOnHandoffPrompt).catch(logAndRethrowHookFailure);
  on('turn.complete', reportContextUsageOnTurnCompleteWithDebugLog).catch(logAndRethrowHookFailure);
  on('classic.Stop', startSwapOnStopWithDebugLog).catch(logAndRethrowHookFailure);
};
