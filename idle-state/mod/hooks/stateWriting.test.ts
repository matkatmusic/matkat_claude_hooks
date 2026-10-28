import { test, expect } from 'claude-code/testing';
import { EXIT_KEY_DELAY_MINUTES, LATE_LIMIT_MINUTES, MS_PER_MINUTE, idleState } from './idleStateShared';
import { scheduleStatePrompt, writeStateFileAndExit } from './stateWriting';
import { STATE_OBJECT, getAssistantMessage, getUserMessage } from './idleStateTestHelpers';
import { createFakeEngine } from './fakeEngineHelpers';

const STATE_PROMPT = 'STATE PROMPT TEXT';

function resetIdleState() {
  idleState.isWritingState = false;
  idleState.stateFilePath = undefined;
  idleState.idleTimer = undefined;
  idleState.lastAnswerAt = 0;
  idleState.statePrompt = STATE_PROMPT;
}

function getErrorMessage(error: Error) {
  return error.message;
}

function getStateMessages(replyText: string) {
  return [getUserMessage(`sent: ${STATE_PROMPT}`), getAssistantMessage(replyText)];
}

async function assertScheduleStatePromptSendsPromptWhenTimerFires() {
  resetIdleState();
  const { fake, engine } = createFakeEngine([]);
  await scheduleStatePrompt(engine, 55);
  expect(fake.timers).toHaveLength(1);
  expect(fake.timers[0]?.ms).toBe(55 * MS_PER_MINUTE);
  expect(idleState.lastAnswerAt).toBe(fake.nowMs);
  await fake.timers[0]?.run();
  expect(fake.submitted).toEqual([idleState.statePrompt]);
  expect(idleState.isWritingState).toBe(true);
}

async function assertScheduleStatePromptSkipsPromptWhenTimerIsLate() {
  resetIdleState();
  const { fake, engine } = createFakeEngine([]);
  await scheduleStatePrompt(engine, 55);
  fake.nowMs += (55 + LATE_LIMIT_MINUTES + 1) * MS_PER_MINUTE;
  await fake.timers[0]?.run();
  expect(fake.submitted).toEqual([]);
  expect(idleState.isWritingState).toBe(false);
}

async function assertWriteStateFileAndExitSkipsWhenAborted() {
  resetIdleState();
  idleState.isWritingState = true;
  const { fake, engine } = createFakeEngine(getStateMessages(JSON.stringify(STATE_OBJECT)));
  await writeStateFileAndExit(engine, true);
  expect(fake.written).toEqual([]);
  expect(fake.commands).toEqual([]);
  expect(idleState.isWritingState).toBe(false);
}

async function assertWriteStateFileAndExitWritesFileThenExits() {
  resetIdleState();
  idleState.isWritingState = true;
  const { fake, engine } = createFakeEngine(getStateMessages(JSON.stringify(STATE_OBJECT)));
  await writeStateFileAndExit(engine, false);
  expect(fake.written[0]).toEqual({ path: '/work/p/.idleState/.gitignore', text: '*\n' });
  const stateFile = fake.written[1];
  expect(stateFile?.path).toMatch(/^\/work\/p\/\.idleState\/\d{4}-\d{2}-\d{2}-\d{4}-abcdef12\.json$/);
  expect(JSON.parse(stateFile?.text ?? '').sessionId).toBe('abcdef1234567890');
  expect(idleState.stateFilePath).toBe(stateFile?.path);
  expect(idleState.isWritingState).toBe(false);
  expect(fake.commands).toEqual(['exit']);
  expect(fake.timers).toEqual([]);
}

async function assertWriteStateFileAndExitSkipsWhenUserTookOver() {
  resetIdleState();
  idleState.isWritingState = true;
  const { fake, engine } = createFakeEngine([getUserMessage('never mind'), getAssistantMessage('Here is the answer.')]);
  await writeStateFileAndExit(engine, false);
  expect(fake.written).toEqual([]);
  expect(idleState.stateFilePath).toBeUndefined();
}

async function assertWriteStateFileAndExitThrowsOnWrappedReply() {
  resetIdleState();
  const { fake, engine } = createFakeEngine(getStateMessages(`Sure: ${JSON.stringify(STATE_OBJECT)} done.`));
  const message = await writeStateFileAndExit(engine, false).catch(getErrorMessage);
  expect(message).toContain('not a bare JSON object');
  expect(fake.commands).toEqual([]);
}

async function assertWriteStateFileAndExitPushesKeysWhenProgramRuns() {
  resetIdleState();
  const { fake, engine } = createFakeEngine(getStateMessages(JSON.stringify(STATE_OBJECT)));
  fake.foundPids = '123\n';
  await writeStateFileAndExit(engine, false);
  expect(JSON.parse(fake.written[1]?.text ?? '').runningPrograms[0].pids).toEqual([123]);
  expect(fake.timers).toHaveLength(1);
  expect(fake.timers[0]?.ms).toBe(EXIT_KEY_DELAY_MINUTES * MS_PER_MINUTE);
  await fake.timers[0]?.run();
  expect(fake.argvs[fake.argvs.length - 1]?.[0]).toBe('python3');
}

test('scheduleStatePrompt sends the state prompt when the timer fires', assertScheduleStatePromptSendsPromptWhenTimerFires);
test('scheduleStatePrompt sends no prompt when the timer fires too late', assertScheduleStatePromptSkipsPromptWhenTimerIsLate);
test('writeStateFileAndExit writes no file after an aborted turn', assertWriteStateFileAndExitSkipsWhenAborted);
test('writeStateFileAndExit writes the state file, then exits', assertWriteStateFileAndExitWritesFileThenExits);
test('writeStateFileAndExit writes no file when the user took over', assertWriteStateFileAndExitSkipsWhenUserTookOver);
test('writeStateFileAndExit throws when the reply is not a bare JSON object', assertWriteStateFileAndExitThrowsOnWrappedReply);
test('writeStateFileAndExit pushes the exit keys when a program runs', assertWriteStateFileAndExitPushesKeysWhenProgramRuns);
