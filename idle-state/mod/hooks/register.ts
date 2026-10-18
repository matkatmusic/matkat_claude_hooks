import type { Register, Hook, EngineInterface } from 'claude-code';

const MS_PER_MINUTE = 60 * 1000;
const IDLE_MINUTES = 55;
const LATE_LIMIT_MINUTES = 58;
const EXIT_KEY_DELAY_MINUTES = 1 / 60;
const IDLE_STATE_FOLDER_NAME = '.idleState';
const REGEX_SPECIAL_CHARACTERS = '\\^$.|?*+()[]{}';
const PUSH_KEYS_SCRIPT = "import os, fcntl, termios\nfd = os.open('/dev/tty', os.O_RDWR)\nfor key in b'2\\r':\n    fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))";

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

const blockPromptAfterStateSaved: Hook<'prompt.submit'> = ($, e, next) => {
  idleTimer?.cancel();
  if (stateFilePath === undefined) {
    const isUserPromptDuringStateWrite = isWritingState && !e.text.includes(statePrompt);
    if (isUserPromptDuringStateWrite)
      isWritingState = false;
    return next(e);
  }
  return { drop: `The chat cache has expired. You should exit this chat. Start a new chat. The SessionStart hook will automatically read ${stateFilePath}` };
};

const denyToolsWhileStatePromptPending: Hook<'tool.call'> = ($, e, next) => {
  if (!isWritingState)
    return next(e);
  return { deny: 'The idle-state prompt is pending. Do not use any tools.' };
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
- For \`runningPrograms\`, give the exact command line that started each program.
- Keep each section under 150 words.`;
  isWritingState = true;
  void $.prompt.submit({ text: statePrompt });
}

const updateIdleStateOnTurnComplete: Hook<'turn.complete'> = async ($, e, next) => {
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
  lastAnswerAt = await $.clock.now();
  async function sendStatePromptUnlessLate() {
    const lateMs = (await $.clock.now()) - lastAnswerAt - IDLE_MINUTES * MS_PER_MINUTE;
    if (lateMs > LATE_LIMIT_MINUTES * MS_PER_MINUTE)
      // computer went to sleep
      return;
    await sendStatePrompt($);
  }
  idleTimer = $.clock.after(IDLE_MINUTES * MS_PER_MINUTE, sendStatePromptUnlessLate);
  return next(e);
};

const writeIdleStateBeforeExit: Hook<'command.run'> = async ($, e, next) => {
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
  // let idleTimer: { cancel: () => void } | undefined;
  // let lastAnswerAt = 0;
  // let isWritingState = false;
  // let stateFilePath: string | undefined;
  // let statePrompt = '';

  on('session.start', clearState);
  on('session.end', clearState);
  on('prompt.submit', blockPromptAfterStateSaved);
  on('turn.complete', updateIdleStateOnTurnComplete);
  on('tool.call', denyToolsWhileStatePromptPending);
  on('command.run', { command: 'exit' }, writeIdleStateBeforeExit);
};
