import type { Register } from 'claude-code';

const IDLE_MS = 3300000;
const LATE_LIMIT_MS = 3480000;
const EXIT_KEY_DELAY_MS = 1000;
const PUSH_KEYS_SCRIPT = "import os, fcntl, termios\nfd = os.open('/dev/tty', os.O_RDWR)\nfor key in b'2\\r':\n    fcntl.ioctl(fd, termios.TIOCSTI, bytes([key]))";

/*
  const STATE_PROMPT = `This chat is idle, and its cache expires soon. Reply with a state file for a fresh chat. Do not use any tools.  Use these sections: ## Project: the project folder and the git branch.  ## Work: what this chat worked on, in 1 to 3 lines.  ## Done: what is done. Say if it is committed.  ## Not done: what is not done.  ## Files: the files this chat changed. List changes from other chats separately.  ## Running: programs this chat started, and if each one still runs.  ## Next step: the next action, and the open questions for the user.  ## Traps: what a fresh chat must know: rules, hooks, mistakes to avoid.  Keep it under 300 words.`;
const STATE_PROMPT = `This chat is idle, and its cache expires soon. Reply with only a JSON object that describes the state of this chat for a fresh chat. Do not use any tools. Do not put the JSON in a code fence.
Use this template ${template}. Each value is an array of short strings or objects. Keep each section under 150 words.`;
*/

function formatTwoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

let isWritingState = false;
let stateFilePath: string | undefined;

function clearState<E, R>(_$: unknown, e: E, next: (e: E) => R): R {
  stateFilePath = undefined;
  isWritingState = false;
  return next(e);
}

export const register: Register = on => {
  let idleTimer: { cancel: () => void } | undefined;
  let lastAnswerAt = 0;
  // let isWritingState = false;
  // let stateFilePath: string | undefined;
  let statePrompt = '';

  on('session.start', clearState);
  on('session.end', clearState);

  on('prompt.submit', ($, e, next) => {
    idleTimer?.cancel();
    if (stateFilePath === undefined)
      return next(e);
    return { drop: `The chat cache has expired. You should exit this chat. Start a new chat. The SessionStart hook will automatically read ${stateFilePath}` };
  });

  on('turn.complete', async ($, e, next) => {
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
      const folderName = await $.env.get('CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME');
      if (folderName === undefined)
        throw new Error('idle-state: set CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME in the Claude process environment');
      // const projectName = root.split('/').at(-1);
      const sessionId = await $.session.id();
      // stateFilePath = `${await $.env.get('HOME')}/.claude/session-states/${projectName}/${stamp}-${sessionId.slice(0, 8)}.md`;
      // stateFilePath = `${root}/.idleState/${stamp}-${sessionId.slice(0, 8)}.md`;
      // stateFilePath = `${root}/${folderName}/${stamp}-${sessionId.slice(0, 8)}.json`;
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
      const state = JSON.parse(stateText);
      let programsAreRunning = false;
      for (const program of state.runningPrograms) {
        const found = await $.process.run(['pgrep', '-f', program.command]); // ponytail: -f takes a regex; a command with regex characters may not match
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

      // await $.fs.write(stateFilePath, JSON.stringify(state, null, 2) + '\n');
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
        $.clock.after(EXIT_KEY_DELAY_MS, async () => {
          const pushed = await $.process.run(['python3', '-I', '-c', PUSH_KEYS_SCRIPT]);
          if (pushed.exitCode !== 0)
            throw new Error(`idle-state: key push failed: ${pushed.stderr}`);
        });
      }
      return next(e);
    }
    lastAnswerAt = await $.clock.now();
    idleTimer = $.clock.after(IDLE_MS, async () => {
      const lateMs = (await $.clock.now()) - lastAnswerAt - IDLE_MS;
      if (lateMs > LATE_LIMIT_MS)
        return;
      const template = await $.fs.read(`${$.plugin.root}/../../shared/idle-state-template.json`);
      statePrompt = `This chat is idle, and its cache expires soon. Reply with only a JSON object that describes the state of this chat for a fresh chat. Do not use any tools. Do not put the JSON in a code fence.
Use the shape of this template: ${template}
Replace each example value with real values. Use an empty array when there is nothing. For runningPrograms, give the exact command line that started each program. Keep each section under 150 words.`;
      isWritingState = true;
      void $.prompt.submit({ text: statePrompt });
    });
    return next(e);
  });
};
