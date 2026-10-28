import { mock } from 'claude-code/testing';

export const IDLE_MS = 3300000;
export const STATE_OBJECT = {
  work: ['built the idle-state mod'],
  done: ['tests pass; not committed'],
  not_done: ['live test'],
  files: ['hooks/register.ts'],
  runningPrograms: [
    { command: 'bun run server', purpose: 'serves the app' },
    { command: 'bun run watcher', purpose: 'watches files' },
  ],
  nextSteps: ['run it in a real chat'],
  traps: ['a Stop hook adds extra turns'],
};
export const TEMPLATE_TEXT = '{ "work": ["what this chat worked on"] }';
export const ANSWER = { answer: 'the state', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const;
export const DISPATCH_ALL_ON = '{ "enablements": { "idle-state": { "session.start": true, "session.end": true, "prompt.submit": true, "turn.complete": true, "tool.call": true, "command.run": true } }, "values": { "idle-state": { "CLAUDE_HOOKS_IDLE_MINUTES": "55" } } }';
export const DISPATCH_ALL_OFF = '{ "enablements": { "idle-state": { "session.start": false, "session.end": false, "prompt.submit": false, "turn.complete": false, "tool.call": false, "command.run": false } }, "values": { "idle-state": { "CLAUDE_HOOKS_IDLE_MINUTES": "55" } } }';
export const NO_PROCESS_FOUND = { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false };

export type RecordedCalls = {
  written: { path: string; text: string }[];
  commands: string[];
  submitted: string[];
};

export function createRecordedCalls(): RecordedCalls {
  return { written: [], commands: [], submitted: [] };
}

export function setUpClockAndEnv(on: any) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') });
  mock.env(on, { HOME: '/home/u' });
  return clock;
}

export function getAnswerText(_$: any, e: any) {
  return { text: e.answer };
}

export function getNoProcessFound() {
  return { value: NO_PROCESS_FOUND };
}

export function setFsStubs(on: any, dispatchText = DISPATCH_ALL_ON) {
  function getFsExists() {
    return { value: false };
  }
  function readFsFile(_$: any, e: any) {
    const isDispatchFile = e.path.endsWith('dispatch.json');
    if (isDispatchFile)
      return { value: dispatchText };
    return { value: TEMPLATE_TEXT };
  }
  on('fs.exists', getFsExists);
  on('fs.read', readFsFile);
}

export function setTurnStubs(on: any, recorded: RecordedCalls) {
  function appendSubmitted(_$: any, e: any) {
    recorded.submitted.push(e.text);
    return { text: e.text };
  }
  on('turn.complete', getAnswerText);
  on('prompt.submit', appendSubmitted);
}

export function setSessionStubs(on: any, recorded: RecordedCalls, getMessages: () => unknown, getProcessResult: (_$: any, e: any) => unknown = getNoProcessFound) {
  function getWorkRoot() {
    return { value: '/work/my-project' };
  }
  function getSessionId() {
    return { value: 'abcdef1234567890' };
  }
  function appendWrite(_$: any, e: any) {
    recorded.written.push(e);
    return { value: undefined };
  }
  function appendCommand(_$: any, e: any) {
    recorded.commands.push(e.command);
    return { text: '' };
  }
  on('session.root', getWorkRoot);
  on('session.id', getSessionId);
  on('fs.write', appendWrite);
  on('command.run', appendCommand);
  on('process.run', getProcessResult);
  on('session.messages', getMessages);
  setFsStubs(on);
  setTurnStubs(on, recorded);
}

export function getAssistantMessage(text: string) {
  return { role: 'assistant', text, toolUses: [] };
}

export function getUserMessage(text: string) {
  return { role: 'user', text, toolUses: [] };
}
