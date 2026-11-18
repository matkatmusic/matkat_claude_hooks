import type { Register, Hook, EngineInterface } from 'claude-code';
import { logAndRethrowHookFailure, logHookFailure } from './logHookFailure';

const PLUGIN_NAME = 'tmux-helper';
const SKILL_NAME = 'matkat-hooks:tmux-new-helper';
const DISPATCHER_DIR = '../../dispatcher';
const OPEN_HELPER_CHATS_SCRIPT = '../../claude-tmux/individualSession/openHelperChats.ts';
const NO_SESSION_TITLE = '';
const OPEN_HELPER_CHATS_TIMEOUT_MS = 120 * 1000;
const NOTICE_SECTION = 'claude-tmux';
const NOTICE_KEY = 'CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE';
const NOTICE_PLACEHOLDER = '{helperHandles}';
const DROP_REASON = 'Opening the helper chats.';

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

async function openHelperChats($: EngineInterface, argumentText: string): Promise<string[]> {
  const scriptPath = `${$.plugin.root}/${OPEN_HELPER_CHATS_SCRIPT}`;
  const result = await $.process.run(['bun', scriptPath, NO_SESSION_TITLE, argumentText], { timeoutMs: OPEN_HELPER_CHATS_TIMEOUT_MS });
  if (result.exitCode !== 0)
    throw new Error(`openHelperChats.ts exited with code ${result.exitCode}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function getHelperHandles(helperNames: string[]): string[] {
  const handles: string[] = [];
  for (const name of helperNames)
    handles.push(`@${name.split(' ').join('-')}`);
  return handles;
}

const openHelperChatsForSkill: Hook<'prompt.submit'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'prompt.submit');
  if (!enabled)
    return next(e);
  if (e.command === undefined)
    return next(e);
  if (e.command.name !== SKILL_NAME)
    return next(e);
  const helperNames = await openHelperChats($, e.command.args);
  const handles = getHelperHandles(helperNames);
  const noticeTemplate = String(await readValue($, NOTICE_SECTION, NOTICE_KEY));
  const text = noticeTemplate.replace(NOTICE_PLACEHOLDER, handles.join(', '));
  async function logRejectedNotice(failure: unknown) {
    const message = failure instanceof Error ? failure.message : String(failure);
    await logHookFailure($, PLUGIN_NAME, 'prompt.submit', { kind: 'throw', message, budget: 0 });
  }
  function sendHelpersCreatedNotice() {
    void $.prompt.submit({ text }).catch(logRejectedNotice);
  }
  $.clock.after(0, sendHelpersCreatedNotice);
  return { drop: DROP_REASON };
};

export const register: Register = on => {
  on('prompt.submit', openHelperChatsForSkill).catch(logAndRethrowHookFailure);
};
