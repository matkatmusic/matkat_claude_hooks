import { test, expect } from 'claude-code/testing';
import {
  ANSWER,
  IDLE_MS,
  NO_PROCESS_FOUND,
  STATE_OBJECT,
  TEMPLATE_TEXT,
  createRecordedCalls,
  getAssistantMessage,
  getUserMessage,
  setSessionStubs,
  setUpClockAndEnv,
} from './idleStateTestHelpers';

test('test_a_throwing_hook_is_logged_under_claude_hooks_logs', async ($, on) => {
  const writes: { path: string; text: string }[] = [];
  on('fs.exists', () => ({ value: false }));
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }));
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined }; });
  on('session.root', () => ({ value: '/work/p' }));
  on('session.id', () => ({ value: 'sess-9' }));
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }));

  await $.session.start({ cwd: '/work/p', surface: null, isInteractive: false });
  expect(writes).toEqual([{ path: '/work/p/.claude_hooks/logs/2026-01-02/idle-state.log', text: '2026-01-02T03:04:05.000Z session=sess-9 event=session.start throw: no implementation for fs.read\n' }]);
});

async function assertIdleChatWritesStateFileThenDropsPrompts($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  const { written, commands, submitted } = recorded;
  function getProcessResult(_$: any, e: any) {
    const isServer = e.argv[2] === 'bun run server';
    if (isServer)
      return { value: { exitCode: 0, stdout: '123\n456\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } };
    return { value: NO_PROCESS_FOUND };
  }
  function getMessages() {
    return {
      value: [
        getAssistantMessage('an old reply'),
        getUserMessage(`The idle-state plugin sent a message:\n${submitted[0]}`),
        getAssistantMessage(JSON.stringify(STATE_OBJECT)),
        getAssistantMessage(''),
        getAssistantMessage('I ran the turn-done script.'),
      ],
    };
  }
  setSessionStubs(on, recorded, getMessages, getProcessResult);

  await $.turn.complete(ANSWER);
  expect(submitted).toEqual([]);
  await clock.advance(IDLE_MS);
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toContain(TEMPLATE_TEXT);

  await $.turn.complete({ ...ANSWER, answer: 'I ran the turn-done script.' });
  expect(written).toHaveLength(2);
  expect(written[0]).toEqual({ path: '/work/my-project/.idleState/.gitignore', text: '*\n' });
  const stateFile = written[1];
  expect(stateFile?.path).toMatch(/^\/work\/my-project\/\.idleState\/\d{4}-\d{2}-\d{2}-\d{4}-abcdef12\.json$/);
  expect(JSON.parse(stateFile?.text ?? '')).toEqual({
    ...STATE_OBJECT,
    sessionId: 'abcdef1234567890',
    runningPrograms: [
      { command: 'bun run server', purpose: 'serves the app', pids: [123, 456], isRunning: true },
      { command: 'bun run watcher', purpose: 'watches files', pids: [], isRunning: false },
    ],
  });
  expect(stateFile?.text).not.toContain('I ran the turn-done script.');
  expect(stateFile?.text).not.toContain('an old reply');
  await clock.settle();
  expect(commands).toEqual(['exit']);

  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } });
  expect(result.drop).toContain(stateFile?.path);
}

async function assertTypingExitWritesStateFileThenExits($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  const { written, commands, submitted } = recorded;
  function getMessages() {
    return {
      value: [
        getUserMessage(`The idle-state plugin sent a message:\n${submitted[0]}`),
        getAssistantMessage(JSON.stringify(STATE_OBJECT)),
      ],
    };
  }
  setSessionStubs(on, recorded, getMessages);

  await $.command.run({ command: 'exit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } });
  await clock.settle();
  expect(submitted).toHaveLength(1);
  expect(submitted[0]).toContain(TEMPLATE_TEXT);
  expect(commands).toEqual([]);

  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(written).toHaveLength(2);
  expect(written[1]?.path).toMatch(/^\/work\/my-project\/\.idleState\/\d{4}-\d{2}-\d{2}-\d{4}-abcdef12\.json$/);
  expect(commands).toEqual(['exit']);
}

test('idle chat writes a state file, exits, then drops prompts', assertIdleChatWritesStateFileThenDropsPrompts);
test('typing exit writes the state file first, then exits', assertTypingExitWritesStateFileThenExits);
