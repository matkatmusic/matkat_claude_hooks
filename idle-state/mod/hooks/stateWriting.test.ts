import { test, expect } from 'claude-code/testing';
import { EXIT_KEY_DELAY_MINUTES, LATE_LIMIT_MINUTES, MS_PER_MINUTE, idleState } from './idleStateShared';
import { scheduleStatePrompt, sendStatePrompt, writeStateFileAndExit } from './stateWriting';
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
  expect(idleState.isWritingState).toBe(false);
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

async function assertWriteStateFileAndExitWritesFileAfterDeniedToolCall() {
  resetIdleState();
  idleState.isWritingState = true;
  const toolResultMessage = {
    ...getUserMessage(''),
    toolResults: [{ tool_use_id: 'toolu_1', text: 'denied while the state prompt is pending', isError: true }],
  };
  const { fake, engine } = createFakeEngine([
    getUserMessage(`sent: ${STATE_PROMPT}`),
    getAssistantMessage(''),
    toolResultMessage,
    getAssistantMessage(JSON.stringify(STATE_OBJECT)),
  ]);
  await writeStateFileAndExit(engine, false);
  expect(fake.written).toHaveLength(2);
  expect(fake.commands).toEqual(['exit']);
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

function getReplyWithDoneFiles(files: string[]) {
  return JSON.stringify({ ...STATE_OBJECT, done: [{ item: 'the work', files, isCommitted: false }] });
}

async function getWrittenDoneItem(files: string[], setUpGit: (fake: ReturnType<typeof createFakeEngine>['fake']) => void) {
  resetIdleState();
  const { fake, engine } = createFakeEngine(getStateMessages(getReplyWithDoneFiles(files)));
  fake.existingPaths.push('/work/p', '/work/p/src', '/work/p/sub', '/work/p/sub/lib');
  setUpGit(fake);
  await writeStateFileAndExit(engine, false);
  return { doneItem: JSON.parse(fake.written[1]?.text ?? '').done[0], fake };
}

function setNoGitChanges() {}

async function assertWriteStateFileAndExitSetsCommittedFileToTrue() {
  // the reply says false for a file that git shows as committed: the written file says true
  const { doneItem } = await getWrittenDoneItem(['src/a.ts'], setNoGitChanges);
  expect(doneItem.isCommitted).toBe(true);
}

async function assertWriteStateFileAndExitSetsChangedFileToFalse() {
  // git shows the file as changed: the written file says false
  function setChangedFile(fake: ReturnType<typeof createFakeEngine>['fake']) {
    fake.gitStatusLines['/work/p/src/a.ts'] = ' M src/a.ts\n';
  }
  const { doneItem } = await getWrittenDoneItem(['src/a.ts', 'src/b.ts'], setChangedFile);
  expect(doneItem.isCommitted).toBe(false);
}

async function assertWriteStateFileAndExitSetsStagedFileToFalse() {
  // git shows the file as staged but not committed: the written file says false
  function setStagedFile(fake: ReturnType<typeof createFakeEngine>['fake']) {
    fake.gitStatusLines['/work/p/src/a.ts'] = 'M  src/a.ts\n';
  }
  const { doneItem } = await getWrittenDoneItem(['src/a.ts'], setStagedFile);
  expect(doneItem.isCommitted).toBe(false);
}

async function assertWriteStateFileAndExitSetsEmptyFilesToTrue() {
  // an item with no files is committed, and git does not run
  const { doneItem, fake } = await getWrittenDoneItem([], setNoGitChanges);
  expect(doneItem.isCommitted).toBe(true);
  let gitRuns = 0;
  for (const argv of fake.argvs) {
    const isGitRun = argv[0] === 'git';
    if (isGitRun)
      gitRuns++;
  }
  expect(gitRuns).toBe(0);
}

async function assertWriteStateFileAndExitSetsMissingFilesToFalseWithError() {
  // an item with no files key gets false and an error, and git does not run
  resetIdleState();
  const reply = JSON.stringify({ ...STATE_OBJECT, done: [{ item: 'the work', isCommitted: true }] });
  const { fake, engine } = createFakeEngine(getStateMessages(reply));
  await writeStateFileAndExit(engine, false);
  const doneItem = JSON.parse(fake.written[1]?.text ?? '').done[0];
  expect(doneItem.isCommitted).toBe(false);
  expect(doneItem.error).toBe('no files in state reply from agent');
  let gitRuns = 0;
  for (const argv of fake.argvs) {
    const isGitRun = argv[0] === 'git';
    if (isGitRun)
      gitRuns++;
  }
  expect(gitRuns).toBe(0);
}

async function assertWriteStateFileAndExitAddsNoErrorForEmptyFiles() {
  // an item with an empty files list gets no error key
  const { doneItem } = await getWrittenDoneItem([], setNoGitChanges);
  expect('error' in doneItem).toBe(false);
}

async function assertWriteStateFileAndExitChecksNestedRepoFileInItsOwnFolder() {
  // a file in a nested repo runs git in the file's own folder, so its own repo answers
  const { fake } = await getWrittenDoneItem(['sub/lib/c.ts'], setNoGitChanges);
  expect(fake.argvs).toContainEqual(['git', '-C', '/work/p/sub/lib', 'status', '--porcelain', '--', '/work/p/sub/lib/c.ts']);
}

async function assertWriteStateFileAndExitChecksMissingFolderInNearestParent() {
  // the file's folder no longer exists: git runs in the nearest folder that exists
  const { fake } = await getWrittenDoneItem(['/work/p/sub/gone/d.ts'], setNoGitChanges);
  expect(fake.argvs).toContainEqual(['git', '-C', '/work/p/sub', 'status', '--porcelain', '--', '/work/p/sub/gone/d.ts']);
}

async function flushPendingPromises() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function assertSendStatePromptRecoversWhenPromptSubmitRejects() {
  resetIdleState();
  const { fake, engine } = createFakeEngine([]);
  fake.submitFailure = 'submit refused';
  await sendStatePrompt(engine);
  await flushPendingPromises();
  expect(idleState.isWritingState).toBe(false);
  expect(fake.argvs[fake.argvs.length - 1]).toEqual(['rm', '-f', '/plugin/../../dispatcher/stop-hooks-off/abcdef1234567890']);
  const failureLog = fake.written[fake.written.length - 1];
  expect(failureLog?.path).toMatch(/^\/work\/p\/\.claude_hooks\/logs\/\d{4}-\d{2}-\d{2}\/idle-state\.log$/);
  expect(failureLog?.text).toContain('submit refused');
}

test('sendStatePrompt clears the writing state, removes the marker and logs the failure when prompt.submit rejects', assertSendStatePromptRecoversWhenPromptSubmitRejects);
test('scheduleStatePrompt sends the state prompt when the timer fires',assertScheduleStatePromptSendsPromptWhenTimerFires);
test('scheduleStatePrompt sends no prompt when the timer fires too late', assertScheduleStatePromptSkipsPromptWhenTimerIsLate);
test('writeStateFileAndExit writes no file after an aborted turn', assertWriteStateFileAndExitSkipsWhenAborted);
test('writeStateFileAndExit writes the state file, then exits', assertWriteStateFileAndExitWritesFileThenExits);
test('writeStateFileAndExit writes no file when the user took over', assertWriteStateFileAndExitSkipsWhenUserTookOver);
test('writeStateFileAndExit writes the state file after a denied tool call', assertWriteStateFileAndExitWritesFileAfterDeniedToolCall);
test('writeStateFileAndExit throws when the reply is not a bare JSON object', assertWriteStateFileAndExitThrowsOnWrappedReply);
test('writeStateFileAndExit pushes the exit keys when a program runs', assertWriteStateFileAndExitPushesKeysWhenProgramRuns);
test('writeStateFileAndExit sets isCommitted to true when git shows the file as committed', assertWriteStateFileAndExitSetsCommittedFileToTrue);
test('writeStateFileAndExit sets isCommitted to false when git shows a file as changed', assertWriteStateFileAndExitSetsChangedFileToFalse);
test('writeStateFileAndExit sets isCommitted to false when git shows a file as staged', assertWriteStateFileAndExitSetsStagedFileToFalse);
test('writeStateFileAndExit sets isCommitted to true for an item with no files', assertWriteStateFileAndExitSetsEmptyFilesToTrue);
test('writeStateFileAndExit sets isCommitted to false and adds an error for an item with no files key', assertWriteStateFileAndExitSetsMissingFilesToFalseWithError);
test('writeStateFileAndExit adds no error for an item with an empty files list', assertWriteStateFileAndExitAddsNoErrorForEmptyFiles);
test('writeStateFileAndExit checks a nested repo file in its own folder',assertWriteStateFileAndExitChecksNestedRepoFileInItsOwnFolder);
test('writeStateFileAndExit checks a file in a missing folder from the nearest folder that exists', assertWriteStateFileAndExitChecksMissingFolderInNearestParent);
