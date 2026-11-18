import { test, expect } from 'claude-code/testing';
import {
  createRecordedCalls,
  setSessionStubs,
  setUpClockAndEnv,
} from './idleStateTestHelpers';

function getNoMessages() {
  return { value: [] };
}

async function assertWriteCallWithoutFilePathThrowsClearError($: any, on: any) {
  // Setup: the idle-state mod is loaded with the usual fake engine stubs.
  setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  setSessionStubs(on, recorded, getNoMessages);
  on('tool.call', () => ({ result: {}, text: 'ran' }));

  // Action: a model sends a Write call with `path` and `file_content` and no `file_path`.
  await $.tool.call({ tool: 'Write', path: '/x/a.ts', file_content: 'x' });

  // Verification: the engine skips a throwing hook and the mod logs the thrown message in its failure log.
  const failureLog = recorded.written[recorded.written.length - 1];
  expect(failureLog?.path).toMatch(/\/idle-state\.log$/);
  expect(failureLog?.text).toMatch(/event=tool\.call throw: idle-state: Write call has no file_path\n$/);
}

test('tool.call throws a clear error for a Write call with no file_path', assertWriteCallWithoutFilePathThrowsClearError);
