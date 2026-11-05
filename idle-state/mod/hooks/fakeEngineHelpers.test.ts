import { test, expect } from 'claude-code/testing';
import { createFakeEngine } from './fakeEngineHelpers';
import { NO_PROCESS_FOUND, getAssistantMessage } from './idleStateTestHelpers';

async function assertFakeEngineRecordsWritesCommandsAndPrompts() {
  const { fake, engine } = createFakeEngine([]);
  const $ = engine as any;
  await $.fs.write('/a', 'b');
  await $.command.run({ command: 'exit' });
  await $.prompt.submit({ text: 'hello' });
  expect(fake.written).toEqual([{ path: '/a', text: 'b' }]);
  expect(fake.commands).toEqual(['exit']);
  expect(fake.submitted).toEqual(['hello']);
}

async function assertFakeEngineReturnsMessagesAndSessionValues() {
  const messages = [getAssistantMessage('hi')];
  const { engine } = createFakeEngine(messages);
  const $ = engine as any;
  expect(await $.session.messages()).toBe(messages);
  expect(await $.session.root()).toBe('/work/p');
  expect(await $.session.id()).toBe('abcdef1234567890');
}

async function assertFakeEngineRecordsTimersAndClock() {
  const { fake, engine } = createFakeEngine([]);
  const $ = engine as any;
  function clearNothing() {
    return undefined;
  }
  $.clock.after(500, clearNothing);
  expect(fake.timers).toEqual([{ ms: 500, run: clearNothing }]);
  fake.nowMs += 1000;
  expect(await $.clock.now()).toBe(fake.nowMs);
}

async function assertFakeEngineProcessResultFollowsFoundPids() {
  const { fake, engine } = createFakeEngine([]);
  const $ = engine as any;
  expect(await $.process.run(['pgrep', '-f', 'x'])).toEqual(NO_PROCESS_FOUND);
  fake.foundPids = '7\n';
  expect((await $.process.run(['pgrep', '-f', 'x'])).stdout).toBe('7\n');
  expect((await $.process.run(['python3', '-I'])).exitCode).toBe(0);
  expect(fake.argvs).toHaveLength(3);
}

async function assertFakeEngineGitStatusFollowsGitStatusLines() {
  const { fake, engine } = createFakeEngine([]);
  const $ = engine as any;
  // a path with no status line prints nothing
  expect(await $.process.run(['git', '-C', '/work/p', 'status', '--porcelain', '--', '/work/p/a.ts'])).toEqual({ ...NO_PROCESS_FOUND, exitCode: 0 });
  // a path with a status line prints that line
  fake.gitStatusLines['/work/p/a.ts'] = ' M a.ts\n';
  expect((await $.process.run(['git', '-C', '/work/p', 'status', '--porcelain', '--', '/work/p/a.ts'])).stdout).toBe(' M a.ts\n');
}

async function assertFakeEngineExistsFollowsExistingPaths() {
  const { fake, engine } = createFakeEngine([]);
  const $ = engine as any;
  expect(await $.fs.exists('/work/p')).toBe(false);
  fake.existingPaths.push('/work/p');
  expect(await $.fs.exists('/work/p')).toBe(true);
}

test('fake engine git status follows gitStatusLines', assertFakeEngineGitStatusFollowsGitStatusLines);
test('fake engine fs.exists follows existingPaths', assertFakeEngineExistsFollowsExistingPaths);
test('fake engine records writes, commands and prompts',assertFakeEngineRecordsWritesCommandsAndPrompts);
test('fake engine returns the messages and session values', assertFakeEngineReturnsMessagesAndSessionValues);
test('fake engine records timers and moves the clock', assertFakeEngineRecordsTimersAndClock);
test('fake engine process result follows foundPids', assertFakeEngineProcessResultFollowsFoundPids);
