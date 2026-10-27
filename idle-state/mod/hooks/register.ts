import type { Register, Hook, EngineInterface } from 'claude-code';

const PLUGIN_NAME = 'idle-state';
const DISPATCHER_DIR = '../../dispatcher';
const MS_PER_MINUTE = 60 * 1000;
// const IDLE_MINUTES = 55;
const IDLE_MINUTES_KEY = 'CLAUDE_HOOKS_IDLE_MINUTES';
const LATE_LIMIT_MINUTES = 58;
const EXIT_KEY_DELAY_MINUTES = 1 / 60;
const IDLE_STATE_FOLDER_NAME = '.idleState';
const REGEX_SPECIAL_CHARACTERS = '\\^$.|?*+()[]{}';
const PUSH_KEYS_SCRIPT = "import os, fcntl, termios\nfd = os.open('/dev/tty', os.O_RDWR)\nfor key in b'2\\r':\n    fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))";

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

function formatTwoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

let isWritingState = false;
let stateFilePath: string | undefined;
let idleTimer: { cancel: () => void } | undefined;
let lastAnswerAt = 0;
let statePrompt = '';

function clearState<E, R>(_$: unknown, e: E, next: (e: E) => R): R {
  stateFilePath = undefined;
  isWritingState = false;
  return next(e);
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
  idleTimer?.cancel();
  if (stateFilePath === undefined) {
    const isUserPromptDuringStateWrite = isWritingState && !e.text.includes(statePrompt);
    if (isUserPromptDuringStateWrite)
      isWritingState = false;
    return next(e);
  }
  return { drop: `The chat cache has expired. You should exit this chat. Start a new chat and run /catch-up.` };
};

const denyToolsWhileStatePromptPending: Hook<'tool.call'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'tool.call');
  if (!enabled)
    return next(e);
  if (!isWritingState)
    return next(e);
  return { deny: 'The idle-state prompt is pending. Do not use any tools.' };
};

const blockStopHooksWhileStatePromptPending: Hook<'classic.Stop'> = async ($, e, next) => {
  if (!isWritingState)
    return next(e);
  return {};
};

const blockSubagentStopHooksWhileStatePromptPending: Hook<'classic.SubagentStop'> = async ($, e, next) => {
  if (!isWritingState)
    return next(e);
  return {};
};

function encodeRegexCharacters(text: string): string {
  let escaped = '';
  for (const character of text) {
    const isSpecial = REGEX_SPECIAL_CHARACTERS.includes(character);
    if (isSpecial)
      escaped += '\\';
    escaped += character;
  }
  return escaped;
}

async function sendStatePrompt($: EngineInterface) {
  const template = await $.fs.read(`${$.plugin.root}/../../shared/idle-state-template.json`);
  statePrompt = `This chat is idle, and its cache expires soon.
Reply with only a JSON object that describes the state of this chat for a fresh chat.
Use the shape of this JSON template:

${template}

Rules for populating the template:
- Do not use any tools.
- Do not put the JSON in a code fence.
- Replace each example value with real values.
- Use an empty array when there is nothing to report for that key.
- Put only unfinished work in \`not_done\`. Put each completed item in \`done\`, never in \`not_done\`.
- For \`runningPrograms\`, give the exact command line that started each program.
- Keep each section under 150 words.`;
  isWritingState = true;
  void $.prompt.submit({ text: statePrompt });
}

const updateIdleStateOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'turn.complete');
  if (!enabled)
    return next(e);
  if (e.agentId !== undefined)
    return next(e);
  idleTimer?.cancel();
  if (isWritingState) {
    isWritingState = false;
    if (e.isAborted)
      return next(e);
    const d = new Date(await $.clock.now());
    const stamp = `${d.getFullYear()}-${formatTwoDigits(d.getMonth() + 1)}-${formatTwoDigits(d.getDate())}-${formatTwoDigits(d.getHours())}${formatTwoDigits(d.getMinutes())}`;
    const root = await $.session.root();
    const folderName = IDLE_STATE_FOLDER_NAME;
    const sessionId = await $.session.id();
    const path = `${root}/${folderName}/${stamp}-${sessionId.slice(0, 8)}.json`;
    const messages = await $.session.messages();
    let stateText = '';
    let userTookOver = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      let isStatePrompt = false;
      if (message.role === 'user')
        isStatePrompt = message.text.includes(statePrompt);
      if (isStatePrompt)
        break;
      if (message.role === 'user') {
        userTookOver = true;
        break;
      }
      let hasAnswerText = false;
      if (message.role === 'assistant')
        hasAnswerText = message.text !== '';
      if (hasAnswerText)
        stateText = message.text;
    }
    if (userTookOver)
      return next(e);
    if (stateText === '')
      throw new Error('idle-state: no assistant text after the state prompt');
    await $.fs.write(`${root}/${folderName}/.gitignore`, '*\n');
    const trimmedStateText = stateText.trim();
    const isBareJsonObject = trimmedStateText.startsWith('{') && trimmedStateText.endsWith('}');
    if (!isBareJsonObject)
      throw new Error(`idle-state: the reply is not a bare JSON object. It was: ${stateText}`);
    const state = JSON.parse(trimmedStateText);
    let programsAreRunning = false;
    for (const program of state.runningPrograms) {
      const found = await $.process.run(['pgrep', '-f', encodeRegexCharacters(program.command)]);
      const isPgrepError = found.exitCode > 1;
      if (isPgrepError)
        throw new Error(`idle-state: pgrep failed: ${found.stderr}`);
      const pids: number[] = [];
      for (const line of found.stdout.split('\n')) {
        if (line !== '')
          pids.push(Number(line));
      }
      program.pids = pids;
      program.isRunning = pids.length > 0;
      if (program.isRunning)
        programsAreRunning = true;
    }

    state.sessionId = sessionId;
    await $.fs.write(path, JSON.stringify(state, null, 2) + '\n');

    stateFilePath = path;
    void $.command.run({ command: 'exit' });
    if (programsAreRunning) {
      /********
      * if background programs are running in the session, the exit command spawns a "Background work is running" with choices for the user.
      * we want to automatically select the second choice, which corresponds to continuing with background work and not killing those tasks, because we're killing this session because the cache expired and telling the user to start another session.
      * HOW: Wait 1 second before pushing the keys to ensure the background work prompt has appeared.
      * python script:
      * import os, fcntl, termios
      * fd = os.open('/dev/tty', os.O_RDWR)
      * for key in b'2\\r':
      *   fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))
      ********/
      async function sendExitChoiceKeys() {
        const pushed = await $.process.run(['python3', '-I', '-c', PUSH_KEYS_SCRIPT]);
        if (pushed.exitCode !== 0)
          throw new Error(`idle-state: key push failed: ${pushed.stderr}`);
      }
      $.clock.after(EXIT_KEY_DELAY_MINUTES * MS_PER_MINUTE, sendExitChoiceKeys);
    }
    return next(e);
  }
  const idleMinutes = Number(await readValue($, PLUGIN_NAME, IDLE_MINUTES_KEY));
  lastAnswerAt = await $.clock.now();
  async function sendStatePromptUnlessLate() {
    const lateMs = (await $.clock.now()) - lastAnswerAt - idleMinutes * MS_PER_MINUTE;
    if (lateMs > LATE_LIMIT_MINUTES * MS_PER_MINUTE)
      // computer went to sleep
      return;
    await sendStatePrompt($);
  }
  idleTimer = $.clock.after(idleMinutes * MS_PER_MINUTE, sendStatePromptUnlessLate);
  return next(e);
};

const writeIdleStateBeforeExit: Hook<'command.run'> = async ($, e, next) => {
  const enabled = await isEventEnabled($, PLUGIN_NAME, 'command.run');
  if (!enabled)
    return next(e);
  if (stateFilePath !== undefined)
    return next(e);
  idleTimer?.cancel();
  function sendStatePromptNow() {
    return sendStatePrompt($);
  }
  $.clock.after(0, sendStatePromptNow);
  return { text: 'Writing the idle-state file before exit.' };
};

export const register: Register = on => {

  on('session.start', clearStateOnSessionStart);
  on('session.end', clearStateOnSessionEnd);
  on('prompt.submit', blockPromptAfterStateSaved);
  on('turn.complete', updateIdleStateOnTurnComplete);
  on('tool.call', denyToolsWhileStatePromptPending);
  on('classic.Stop', blockStopHooksWhileStatePromptPending);
  on('classic.SubagentStop', blockSubagentStopHooksWhileStatePromptPending);
  on('command.run', { command: 'exit' }, writeIdleStateBeforeExit);
};
