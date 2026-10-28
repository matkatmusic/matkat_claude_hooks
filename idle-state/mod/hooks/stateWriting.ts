import type { EngineInterface } from 'claude-code';
import {
  EXIT_KEY_DELAY_MINUTES,
  IDLE_STATE_FOLDER_NAME,
  LATE_LIMIT_MINUTES,
  MS_PER_MINUTE,
  PUSH_KEYS_SCRIPT,
  encodeRegexCharacters,
  formatTwoDigits,
  idleState,
} from './idleStateShared';

export async function sendStatePrompt($: EngineInterface) {
  const template = await $.fs.read(`${$.plugin.root}/../../shared/idle-state-template.json`);
  idleState.statePrompt = `This chat is idle, and its cache expires soon.
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
  idleState.isWritingState = true;
  void $.prompt.submit({ text: idleState.statePrompt });
}

export async function scheduleStatePrompt($: EngineInterface, idleMinutes: number) {
  idleState.lastAnswerAt = await $.clock.now();
  async function sendStatePromptUnlessLate() {
    const lateMs = (await $.clock.now()) - idleState.lastAnswerAt - idleMinutes * MS_PER_MINUTE;
    if (lateMs > LATE_LIMIT_MINUTES * MS_PER_MINUTE)
      // computer went to sleep
      return;
    await sendStatePrompt($);
  }
  idleState.idleTimer = $.clock.after(idleMinutes * MS_PER_MINUTE, sendStatePromptUnlessLate);
}

export async function writeStateFileAndExit($: EngineInterface, isAborted: boolean | undefined) {
  idleState.isWritingState = false;
  if (isAborted)
    return;
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
      isStatePrompt = message.text.includes(idleState.statePrompt);
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
    return;
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

  idleState.stateFilePath = path;
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
}
