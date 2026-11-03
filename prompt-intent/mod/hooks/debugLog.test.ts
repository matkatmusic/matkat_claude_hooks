import { test, expect } from 'claude-code/testing';
import { wrapNextForDebugLog } from './logHookFailure';

function makeFakeEngine(debugLoggingEnabled: boolean) {
  const lines: any[] = [];
  const $: any = {
    plugin: { name: 'fake-mod', root: '/p' },
    fs: {
      exists: async () => false,
      read: async () => `{ "debugLoggingEnabled": ${debugLoggingEnabled}, "enablements": {} }`,
    },
    session: { root: async () => '/w', id: async () => 's1' },
    clock: { now: async () => 0 },
    process: {
      run: async (_argv: string[], init: { stdin: string }) => {
        lines.push(JSON.parse(init.stdin));
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
  };
  return { $, lines };
}

function makeFakeNext() {
  const next: any = async (e: any) => ({ ...e, seen: true });
  next.origin = { kind: 'plugin', name: 'other' };
  next.event = 'prompt.submit';
  Object.defineProperty(next, 'called', { get: () => true });
  return next;
}

async function callNextTwiceAndReadProperties(e: any, next: any) {
  const first = await next(e);
  const second = await next({ text: 'again' });
  return { origin: next.origin, event: next.event, called: next.called, first, second };
}

async function runWrappedHook($: any, next: any) {
  const debugLog = await wrapNextForDebugLog($, 'twice', 'prompt.submit', { text: 'hi' }, next);
  const returned = await callNextTwiceAndReadProperties({ text: 'hi' }, debugLog.next);
  await debugLog.finish(returned);
  return returned;
}

async function assertWrappedNextKeepsItsProperties() {
  const { $ } = makeFakeEngine(true);
  const returned: any = await runWrappedHook($, makeFakeNext());
  expect(returned.origin).toEqual({ kind: 'plugin', name: 'other' });
  expect(returned.event).toBe('prompt.submit');
  expect(returned.called).toBe(true);
  expect(returned.second).toEqual({ text: 'again', seen: true });
}

async function assertEveryNextCallIsLogged() {
  const { $, lines } = makeFakeEngine(true);
  await runWrappedHook($, makeFakeNext());
  expect(lines.map(line => line.kind)).toEqual(['hook.input', 'hook.output']);
  expect(lines[0].input).toEqual({ text: 'hi' });
  expect(lines[1].passedToNext).toEqual([{ text: 'hi' }, { text: 'again' }]);
  expect(lines[1].returned.second).toEqual({ text: 'again', seen: true });
}

async function assertOffHandsBackTheOriginalNextAndLogsNothing() {
  const { $, lines } = makeFakeEngine(false);
  const next = makeFakeNext();
  const debugLog = await wrapNextForDebugLog($, 'same', 'prompt.submit', { text: 'hi' }, next);
  await debugLog.finish('done');
  expect(debugLog.next).toBe(next);
  expect(lines).toHaveLength(0);
}

async function assertMissingDebugKeyThrowsAndNamesTheKey() {
  const { $ } = makeFakeEngine(true);
  $.fs.read = async () => '{ "enablements": {} }';
  await expect(wrapNextForDebugLog($, 'same', 'prompt.submit', { text: 'hi' }, makeFakeNext())).rejects.toThrow('debugLoggingEnabled');
}

test('test_a_missing_debug_key_throws_and_names_the_key', assertMissingDebugKeyThrowsAndNamesTheKey);
test('test_wrapped_next_keeps_origin_event_and_called', assertWrappedNextKeepsItsProperties);
test('test_every_next_call_is_logged_as_passed_to_next', assertEveryNextCallIsLogged);
test('test_debug_off_hands_back_the_original_next_and_logs_nothing', assertOffHandsBackTheOriginalNextAndLogsNothing);
