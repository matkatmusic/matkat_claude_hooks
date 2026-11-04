import { test, expect } from 'claude-code/testing';
import {
  ANSWER,
  DISPATCH_ALL_OFF,
  IDLE_MS,
  MARKER_PATH_END,
  NO_PROCESS_FOUND,
  STATE_OBJECT,
  createRecordedCalls,
  getAssistantMessage,
  setFsStubs,
  setSessionStubs,
  setTurnStubs,
  setUpClockAndEnv,
} from './idleStateTestHelpers';

function getNoMessages() {
  return { value: [] };
}

async function assertToolsAreDeniedWhilePromptPending($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  let toolsRun = 0;
  function countToolRun() {
    toolsRun++;
    return { result: {}, text: 'ran' };
  }
  const recorded = createRecordedCalls();
  setSessionStubs(on, recorded, getNoMessages);
  on('tool.call', countToolRun);

  await $.turn.complete(ANSWER);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(1);

  await clock.advance(IDLE_MS);
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(1);

  await $.turn.complete({ ...ANSWER, isAborted: true });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolsRun).toBe(2);
}

async function assertStopHooksOffMarkerIsWrittenThenRemoved($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  const removedCommands: string[][] = [];
  function recordRemovedCommand(_$: any, e: any) {
    removedCommands.push(e.argv);
    return { value: NO_PROCESS_FOUND };
  }
  setSessionStubs(on, recorded, getNoMessages, recordRemovedCommand);

  await $.turn.complete(ANSWER);
  expect(recorded.written).toEqual([]);

  await clock.advance(IDLE_MS);
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });
  expect(recorded.written).toHaveLength(1);
  expect(recorded.written[0]!.path.endsWith(MARKER_PATH_END)).toBe(true);
  expect(removedCommands).toEqual([]);

  await $.turn.complete({ ...ANSWER, isAborted: true });
  expect(removedCommands).toHaveLength(1);
  expect(removedCommands[0]!.slice(0, 2)).toEqual(['rm', '-f']);
  expect(removedCommands[0]![2]!.endsWith(MARKER_PATH_END)).toBe(true);
}

async function assertStopHooksOffMarkerIsRemovedWhenUserTakesOver($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  const removedCommands: string[][] = [];
  function recordRemovedCommand(_$: any, e: any) {
    removedCommands.push(e.argv);
    return { value: NO_PROCESS_FOUND };
  }
  setSessionStubs(on, recorded, getNoMessages, recordRemovedCommand);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });

  await $.prompt.submit({ text: 'never mind, do this instead', wait: false, origin: { kind: 'composer' } });
  expect(removedCommands).toHaveLength(1);
  expect(removedCommands[0]!.slice(0, 2)).toEqual(['rm', '-f']);
  expect(removedCommands[0]![2]!.endsWith(MARKER_PATH_END)).toBe(true);
}

async function assertUserPromptLetsToolsRunAgain($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  let toolsRun = 0;
  function countToolRun() {
    toolsRun++;
    return { result: {}, text: 'ran' };
  }
  const recorded = createRecordedCalls();
  setSessionStubs(on, recorded, getNoMessages);
  on('tool.call', countToolRun);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });
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
    const isPgrep = e.argv[0] === 'pgrep';
    if (isPgrep)
      patterns.push(e.argv[2] ?? '');
    return { value: NO_PROCESS_FOUND };
  }
  const recorded = createRecordedCalls();
  setSessionStubs(on, recorded, getMessages, appendPattern);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });
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
test('the stop-hooks-off marker is written when the state prompt starts and removed when its turn ends', assertStopHooksOffMarkerIsWrittenThenRemoved);
test('the stop-hooks-off marker is removed when the user takes over', assertStopHooksOffMarkerIsRemovedWhenUserTakesOver);
test('a user prompt during the state turn lets tools run again', assertUserPromptLetsToolsRunAgain);
test('pgrep gets the program command with regex characters escaped', assertPgrepGetsEscapedProgramCommand);
test('all events disabled in dispatch.json: the idle timer never starts and tools run', assertDisabledEventsNeverStartIdleTimer);
