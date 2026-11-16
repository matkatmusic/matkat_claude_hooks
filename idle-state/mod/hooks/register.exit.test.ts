import { test, expect, mock } from 'claude-code/testing';
import { idleState } from './idleStateShared';
import {
  ANSWER,
  MARKER_PATH_END,
  DISPATCH_ALL_OFF,
  DISPATCH_ALL_ON,
  DISPATCH_ALL_ON_WITH_DEBUG,
  existingFsPathEnds,
  NO_PROCESS_FOUND,
  STATE_OBJECT,
  STOP_EVENT,
  createRecordedCalls,
  getAssistantMessage,
  getUserMessage,
  setSessionStubs,
} from './idleStateTestHelpers';

async function waitForHooksToFinish() {
  await new Promise(resolve => setTimeout(resolve, 50));
}

const EXIT_COMMAND ={ command: 'exit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const;

function getNowValue() {
  return { value: Date.parse('2026-10-15T10:00:00') };
}

function setUpExitRecording(on: any, dispatchText: string) {
  mock.env(on, { HOME: '/home/u' });
  on('clock.now', getNowValue);
  const clock = { settle: waitForHooksToFinish };
  const recorded = createRecordedCalls();
  const events: string[] = [];
  const messagesOverride: { value: unknown[] | undefined } = { value: undefined };
  function getMessages() {
    if (messagesOverride.value !== undefined)
      return { value: messagesOverride.value };
    return {
      value: [
        getUserMessage(`The idle-state plugin sent a message:\n${recorded.submitted[0]}`),
        getAssistantMessage(JSON.stringify(STATE_OBJECT)),
      ],
    };
  }
  function recordProcessRun(_$: any, e: any) {
    const requestText = JSON.stringify(e);
    const isExitHookOutputLine = requestText.includes('hook.output') && requestText.includes('writeIdleStateBeforeExit');
    if (isExitHookOutputLine)
      events.push('debug-output');
    const isDebugWrite = e.argv[0] === 'sh';
    if (isDebugWrite)
      return { value: { ...NO_PROCESS_FOUND, exitCode: 0 } };
    return { value: NO_PROCESS_FOUND };
  }
  function recordTimer() {
    events.push('clock.after');
    return { value: undefined };
  }
  setSessionStubs(on, recorded, getMessages, recordProcessRun, dispatchText);
  on('clock.after', recordTimer);
  return { clock, recorded, events, messagesOverride };
}

async function assertExitDebugOutputLineIsWrittenBeforeTimerIsSet($: any, on: any) {
  // debug logging on: the hook.output debug line is written first, the timer is set after it
  const { clock, events } = setUpExitRecording(on, DISPATCH_ALL_ON_WITH_DEBUG);

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(events).toEqual(['debug-output', 'clock.after']);
}

async function assertExitSetsTimerAndSendsPromptWithDebugLoggingOff($: any, on: any) {
  // debug logging off: exit sets the timer once and the timer sends the state prompt
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_ON);

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(events).toEqual(['clock.after']);
  expect(recorded.submitted).toHaveLength(1);
}

async function assertExitSetsNoTimerWhenStateFileIsWritten($: any, on: any) {
  // exit starts the state write, the state file is written, the second exit sets no timer
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_ON);

  await $.classic.Stop(STOP_EVENT);
  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  await $.turn.start({ text: recorded.submitted[0]!, turnId: 't2' });
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(recorded.commands).toEqual(['exit']);
  expect(events).toEqual(['clock.after']);
  expect(recorded.submitted).toHaveLength(1);
}

function countToolRuns(on: any) {
  const toolRuns = { count: 0 };
  function countToolRun() {
    toolRuns.count++;
    return { result: {}, text: 'ran' };
  }
  on('tool.call', countToolRun);
  return toolRuns;
}

async function assertExitDuringRunningTurnWaitsForTheStatePromptTurn($: any, on: any) {
  // exit typed during a running turn: that turn ends first and must not consume the state write
  idleState.isWritingState = false;
  idleState.statePrompt = '';
  const { clock, recorded, messagesOverride } = setUpExitRecording(on, DISPATCH_ALL_ON);
  const toolRuns = countToolRuns(on);

  await $.classic.Stop(STOP_EVENT);
  // exit queues the state prompt, and the older turn is still running
  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(recorded.submitted).toHaveLength(1);
  const statePromptText = recorded.submitted[0]!;

  // the older turn ends: no state file, no exit, tools still run
  messagesOverride.value = [getUserMessage('a long running prompt'), getAssistantMessage('the long answer')];
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(recorded.commands).toEqual([]);
  expect(recorded.written).toEqual([]);
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolRuns.count).toBe(1);

  // the state prompt's turn starts: tools are denied and the marker is written
  await $.turn.start({ text: statePromptText, turnId: 't2' });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolRuns.count).toBe(1);
  expect(recorded.written).toHaveLength(1);
  expect(recorded.written[0]!.path.endsWith(MARKER_PATH_END)).toBe(true);

  // the state prompt's turn ends: the state file is written and exit runs
  messagesOverride.value = [getUserMessage(`The idle-state plugin sent a message:\n${statePromptText}`), getAssistantMessage(JSON.stringify(STATE_OBJECT))];
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(recorded.written).toHaveLength(3);
  expect(recorded.commands).toEqual(['exit']);
}

async function assertTurnStartWithOtherTextDoesNotStartStateWrite($: any, on: any) {
  // a turn that starts with other text leaves tools allowed and writes no marker
  idleState.isWritingState = false;
  idleState.statePrompt = '';
  const { clock, recorded } = setUpExitRecording(on, DISPATCH_ALL_ON);
  const toolRuns = countToolRuns(on);

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  await $.turn.start({ text: 'a normal user prompt', turnId: 't2' });
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolRuns.count).toBe(1);
  expect(recorded.written).toEqual([]);
}

async function assertTurnStartBeforeAnyStatePromptDoesNotStartStateWrite($: any, on: any) {
  // no state prompt exists yet: every text includes the empty prompt, so the turn must still be ignored
  idleState.isWritingState = false;
  idleState.statePrompt = '';
  const { clock, recorded } = setUpExitRecording(on, DISPATCH_ALL_ON);
  const toolRuns = countToolRuns(on);

  await $.turn.start({ text: 'a normal user prompt', turnId: 't1' });
  await clock.settle();
  await $.tool.call({ tool: 'Read', file_path: '/a.md' });
  expect(toolRuns.count).toBe(1);
  expect(recorded.written).toEqual([]);
}

async function assertExitSetsNoTimerWhenEventIsDisabled($: any, on: any) {
  // command.run disabled in dispatch.json: exit passes through, no timer, no prompt
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_OFF);

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(events).toEqual([]);
  expect(recorded.submitted).toEqual([]);
  expect(recorded.commands).toEqual(['exit']);
}

async function assertExitSendsNoPromptAfterHandoffStateFileIsWritten($: any, on: any) {
  // the main agent writes a handoff state file, then the user exits: no state prompt is sent
  idleState.handoffStateFilePath = undefined;
  idleState.stateFilePath = undefined;
  idleState.isWritingState = false;
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_ON);
  countToolRuns(on);

  await $.tool.call({ tool: 'Write', file_path: '/work/p/.idleState/2026-10-15-1000-abcdefgh.json', content: '{}' });
  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(events).toEqual([]);
  expect(recorded.submitted).toHaveLength(0);
}

async function assertExitSendsPromptWhenAPromptFollowsTheHandoffStateFile($: any, on: any) {
  // the main agent writes a handoff state file, the user submits a prompt, then exits: the state prompt is sent
  idleState.handoffStateFilePath = undefined;
  idleState.stateFilePath = undefined;
  idleState.isWritingState = false;
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_ON);
  countToolRuns(on);

  await $.tool.call({ tool: 'Write', file_path: '/work/p/.idleState/2026-10-15-1000-abcdefgh.json', content: '{}' });
  await $.prompt.submit({ text: 'do more work', wait: false, origin: { kind: 'composer' } });
  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(events).toEqual(['clock.after']);
  expect(recorded.submitted).toHaveLength(2);
}

async function assertExitRunsAtOnceWhenHandoffDoneMarkerExists($: any, on: any) {
  // the swap script wrote the handoff-done marker for this session: exit runs, no timer, no state prompt
  idleState.handoffStateFilePath = undefined;
  idleState.stateFilePath = undefined;
  idleState.isWritingState = false;
  const { clock, recorded, events } = setUpExitRecording(on, DISPATCH_ALL_ON);
  existingFsPathEnds.push('/dispatcher/handoff-done/abcdef1234567890');

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  existingFsPathEnds.length = 0;
  expect(recorded.commands).toEqual(['exit']);
  expect(events).toEqual([]);
  expect(recorded.submitted).toEqual([]);
}

async function assertExitWritesStateWhenNoHandoffDoneMarker($: any, on: any) {
  // no marker and no state file path: exit writes the idle-state file first, as before
  idleState.handoffStateFilePath = undefined;
  idleState.stateFilePath = undefined;
  idleState.isWritingState = false;
  const { clock } = setUpExitRecording(on, DISPATCH_ALL_ON);

  const returned = await $.command.run(EXIT_COMMAND);
  await clock.settle();
  expect(returned).toEqual({ text: 'Writing the idle-state file before exit.' });
}

test('exit runs at once when the handoff-done marker exists', assertExitRunsAtOnceWhenHandoffDoneMarkerExists);
test('exit writes the state file when no handoff-done marker exists', assertExitWritesStateWhenNoHandoffDoneMarker);
test('with debug logging on, exit writes the hook.output debug line before it sets the timer', assertExitDebugOutputLineIsWrittenBeforeTimerIsSet);
test('with debug logging off, exit sets the timer and sends the state prompt', assertExitSetsTimerAndSendsPromptWithDebugLoggingOff);
test('exit sets no timer once the state file is written', assertExitSetsNoTimerWhenStateFileIsWritten);
test('exit sets no timer when command.run is disabled', assertExitSetsNoTimerWhenEventIsDisabled);
test('exit during a running turn waits for the state prompt turn before it writes the state file', assertExitDuringRunningTurnWaitsForTheStatePromptTurn);
test('a turn.start with other text does not start the state write', assertTurnStartWithOtherTextDoesNotStartStateWrite);
test('a turn.start before any state prompt exists does not start the state write', assertTurnStartBeforeAnyStatePromptDoesNotStartStateWrite);
test('exit sends no state prompt after the main agent wrote a handoff state file', assertExitSendsNoPromptAfterHandoffStateFileIsWritten);
test('exit sends the state prompt when a prompt follows the handoff state file', assertExitSendsPromptWhenAPromptFollowsTheHandoffStateFile);
