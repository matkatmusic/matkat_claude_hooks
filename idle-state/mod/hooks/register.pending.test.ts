import { test, expect } from 'claude-code/testing';
import {
  ANSWER,
  DISPATCH_ALL_OFF,
  IDLE_MS,
  NO_PROCESS_FOUND,
  STATE_OBJECT,
  createRecordedCalls,
  getAssistantMessage,
  setFsStubs,
  setSessionStubs,
  setTurnStubs,
  setUpClockAndEnv,
} from './idleStateTestHelpers';

async function assertToolsAreDeniedWhilePromptPending($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  let toolsRun = 0;
  function countToolRun() {
    toolsRun++;
    return { result: {}, text: 'ran' };
  }
  setFsStubs(on);
  setTurnStubs(on, createRecordedCalls());
  on('tool.call', countToolRun);

  await $.turn.complete(ANSWER);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(1);

  await clock.advance(IDLE_MS);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(1);

  await $.turn.complete({ ...ANSWER, isAborted: true });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(2);
}

async function assertStopHooksAreSkippedWhilePromptPending($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  let stopHooksRun = 0;
  function countStopHookRun() {
    stopHooksRun++;
    return { block: 'run the stop checks' };
  }
  setFsStubs(on);
  setTurnStubs(on, createRecordedCalls());
  on('classic.Stop', countStopHookRun);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  const pendingResult = await $.classic.Stop({ stop_hook_active: false });
  expect(pendingResult.block).toBeUndefined();
  expect(stopHooksRun).toBe(0);

  await $.turn.complete({ ...ANSWER, isAborted: true });
  const afterResult = await $.classic.Stop({ stop_hook_active: false });
  expect(afterResult.block).toBe('run the stop checks');
  expect(stopHooksRun).toBe(1);
}

async function assertUserPromptLetsToolsRunAgain($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  let toolsRun = 0;
  function countToolRun() {
    toolsRun++;
    return { result: {}, text: 'ran' };
  }
  setFsStubs(on);
  setTurnStubs(on, createRecordedCalls());
  on('tool.call', countToolRun);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(0);

  await $.prompt.submit({ text: 'never mind, do this instead', wait: false, origin: { kind: 'composer' } });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(1);
}

async function assertPgrepGetsEscapedProgramCommand($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const patterns: string[] = [];
  const state = { ...STATE_OBJECT, runningPrograms: [{ command: 'node server.js --port=(80)', purpose: 'serves' }] };
  function getMessages() {
    return { value: [getAssistantMessage(JSON.stringify(state))] };
  }
  function appendPattern(_$: any, e: any) {
    patterns.push(e.argv[2] ?? '');
    return { value: NO_PROCESS_FOUND };
  }
  setSessionStubs(on, createRecordedCalls(), getMessages, appendPattern);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(patterns).toEqual(['node server\\.js --port=\\(80\\)']);
}

async function assertDisabledEventsNeverStartIdleTimer($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  let toolsRun = 0;
  function countToolRun() {
    toolsRun++;
    return { result: {}, text: 'ran' };
  }
  setFsStubs(on, DISPATCH_ALL_OFF);
  setTurnStubs(on, recorded);
  on('tool.call', countToolRun);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(recorded.submitted).toEqual([]);
  expect(toolsRun).toBe(1);
}

test('tools are denied while the state prompt is pending, then allowed again', assertToolsAreDeniedWhilePromptPending);
test('Stop hooks are skipped while the state prompt is pending, then run again', assertStopHooksAreSkippedWhilePromptPending);
test('a user prompt during the state turn lets tools run again', assertUserPromptLetsToolsRunAgain);
test('pgrep gets the program command with regex characters escaped', assertPgrepGetsEscapedProgramCommand);
test('all events disabled in dispatch.json: the idle timer never starts and tools run', assertDisabledEventsNeverStartIdleTimer);
