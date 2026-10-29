import { test, expect } from 'claude-code/testing';
import {
  ANSWER,
  IDLE_MS,
  STATE_OBJECT,
  createRecordedCalls,
  getAssistantMessage,
  getUserMessage,
  setSessionStubs,
  setUpClockAndEnv,
} from './idleStateTestHelpers';

async function assertAbortedStateTurnWritesNoFile($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  function getMessages() {
    return { value: [getAssistantMessage(JSON.stringify(STATE_OBJECT))] };
  }
  setSessionStubs(on, recorded, getMessages);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.complete({ ...ANSWER, isAborted: true });
  await clock.settle();
  expect(recorded.written).toEqual([]);
  expect(recorded.commands).toEqual([]);

  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } });
  expect(result.drop).toBeUndefined();
}

async function assertUserTypingAfterStatePromptWritesNoFile($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  function getMessages() {
    return {
      value: [
        getUserMessage(`The idle-state plugin sent a message:\n${recorded.submitted[0]}`),
        getUserMessage('never mind, do this instead'),
        getAssistantMessage('You are right. Here is the answer.'),
      ],
    };
  }
  setSessionStubs(on, recorded, getMessages);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.complete(ANSWER);
  await clock.settle();
  expect(recorded.written).toEqual([]);
}

async function assertWrappedReplyWritesNoStateFile($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const wrappedReply = `Sure, here it is: ${JSON.stringify(STATE_OBJECT)} Hope that helps.`;
  const recorded = createRecordedCalls();
  function getMessages() {
    return { value: [getAssistantMessage(wrappedReply)] };
  }
  setSessionStubs(on, recorded, getMessages);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.complete(ANSWER);
  await clock.settle();
  const writtenPaths: string[] = [];
  for (const file of recorded.written)
    writtenPaths.push(file.path);
  expect(writtenPaths).toEqual(['/work/my-project/.idleState/.gitignore', '/work/my-project/.claude_hooks/logs/2026-10-15/idle-state.log']);
  expect(recorded.commands).toEqual([]);
}

async function assertSessionEndStopsDroppingPrompts($: any, on: any) {
  const clock = setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  function getMessages() {
    return { value: [getAssistantMessage(JSON.stringify(STATE_OBJECT))] };
  }
  function getSessionEnd(_$: any, e: any) {
    return { sessionId: e.sessionId };
  }
  setSessionStubs(on, recorded, getMessages);
  on('session.end', getSessionEnd);

  await $.turn.complete(ANSWER);
  await clock.advance(IDLE_MS);
  await $.turn.complete(ANSWER);
  await clock.settle();
  const dropped = await $.prompt.submit({ text: 'before end', wait: false, origin: { kind: 'composer' } });
  expect(dropped.drop).toBeDefined();

  await $.session.end({ reason: 'resume', sessionId: 'abcdef1234567890', resume: { sessionId: 'abcdef1234567890' } } as never);
  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } });
  expect(result.drop).toBeUndefined();
}

test('aborted state turn writes no file and the next prompt is not dropped', assertAbortedStateTurnWritesNoFile);
test('user typing after the state prompt writes no file and does not parse the reply', assertUserTypingAfterStatePromptWritesNoFile);
test('a reply wrapped in extra text writes no state file and does not exit', assertWrappedReplyWritesNoStateFile);
test('session end after a state write stops dropping prompts', assertSessionEndStopsDroppingPrompts);
