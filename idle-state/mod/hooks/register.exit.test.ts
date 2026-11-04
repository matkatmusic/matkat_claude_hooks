import { test, expect, mock } from 'claude-code/testing';
import {
  ANSWER,
  DISPATCH_ALL_OFF,
  DISPATCH_ALL_ON,
  DISPATCH_ALL_ON_WITH_DEBUG,
  NO_PROCESS_FOUND,
  STATE_OBJECT,
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
  function getMessages() {
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
  return { clock, recorded, events };
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

  await $.command.run(EXIT_COMMAND);
  await clock.settle();
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(recorded.commands).toEqual(['exit']);
  expect(events).toEqual(['clock.after']);
  expect(recorded.submitted).toHaveLength(1);
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

test('with debug logging on, exit writes the hook.output debug line before it sets the timer', assertExitDebugOutputLineIsWrittenBeforeTimerIsSet);
test('with debug logging off, exit sets the timer and sends the state prompt', assertExitSetsTimerAndSendsPromptWithDebugLoggingOff);
test('exit sets no timer once the state file is written', assertExitSetsNoTimerWhenStateFileIsWritten);
test('exit sets no timer when command.run is disabled', assertExitSetsNoTimerWhenEventIsDisabled);
