import type { Register, Hook, EngineInterface } from 'claude-code';

const PLUGIN_NAME = 'anything-for-me';
const DISPATCHER_DIR = '../../dispatcher';
const PROMPT_TEXT = 'Is there anything for me to look at right now that would resolve or close some items on the task list, or provide the information needed for a pending task?';

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

const registerCommandOnSessionStart: Hook<'session.start'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'session.start');
  if (!enabled)
    return next(e);
  await $.command.register({ name: 'anything-for-me', description: 'Ask Claude what you can check now to close or unblock tasks' });
  return next(e);
};

const sendPromptOnCommandRun: Hook<'command.run'> = async ($) => {
  function sendPromptNow() {
    void $.prompt.submit({ text: PROMPT_TEXT, asUser: true });
  }
  $.clock.after(0, sendPromptNow);
  return {};
};

export const register: Register = on => {
  on('session.start', registerCommandOnSessionStart);
  on('command.run', { command: 'anything-for-me' }, sendPromptOnCommandRun);
};
