import { test, expect } from 'claude-code/testing';
import {
  existingFsPathEnds,
  fsFileTextsByPathEnd,
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

function getMarkedHandoffPath() {
  return '/work/p/.idleState/right.json';
}

function getExitCommand() {
  return { command: 'exit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } } as const;
}

function setHandoffPathMarkerFile(hasMarker: boolean) {
  const markerPathEnd = '/dispatcher/handoff-path/abcdef1234567890';
  existingFsPathEnds.length = 0;
  for (const pathEnd of Object.keys(fsFileTextsByPathEnd))
    delete fsFileTextsByPathEnd[pathEnd];
  if (hasMarker) {
    existingFsPathEnds.push(markerPathEnd);
    fsFileTextsByPathEnd[markerPathEnd] = `${getMarkedHandoffPath()}\n`;
  }
}

function setUpHandoffPathMarker(on: any, hasMarker: boolean) {
  setHandoffPathMarkerFile(hasMarker);
  setUpClockAndEnv(on);
  const recorded = createRecordedCalls();
  setSessionStubs(on, recorded, getNoMessages);
  const toolRuns = { count: 0 };
  function countToolRun() {
    toolRuns.count++;
    return { result: {}, text: 'ran' };
  }
  on('tool.call', countToolRun);
  return toolRuns;
}

async function assertWriteToOtherHandoffPathIsDeniedWhenMarkerExists($: any, on: any) {
  // Setup: the marker names one handoff path.
  const toolRuns = setUpHandoffPathMarker(on, true);

  // Action: a model writes a handoff file to a different .idleState path.
  const returned = await $.tool.call({ tool: 'Write', file_path: '/work/p/.idleState/wrong.json', content: '{}' });

  // Verification: the call is denied with the marker path, and no later handler runs.
  expect(JSON.stringify(returned)).toContain(getMarkedHandoffPath());
  expect(toolRuns.count).toBe(0);
}

async function assertDeniedHandoffPathIsNotSaved($: any, on: any) {
  // Setup: the marker names one handoff path.
  setUpHandoffPathMarker(on, true);

  // Action: a model writes a handoff file to a different path, then the user exits.
  await $.tool.call({ tool: 'Write', file_path: '/work/p/.idleState/wrong.json', content: '{}' });
  const returned = await $.command.run(getExitCommand());

  // Verification: the mod saved no handoff path, so exit still asks for the idle-state file.
  expect(returned).toEqual({ text: 'Writing the idle-state file before exit.' });
}

async function assertWriteToMarkedHandoffPathGoesThrough($: any, on: any) {
  // Setup: the marker names one handoff path.
  const toolRuns = setUpHandoffPathMarker(on, true);

  // Action: a model writes the handoff file to exactly that path.
  await $.tool.call({ tool: 'Write', file_path: getMarkedHandoffPath(), content: '{}' });

  // Verification: the call goes through.
  expect(toolRuns.count).toBe(1);
}

async function assertWriteToAnyHandoffPathGoesThroughWhenNoMarker($: any, on: any) {
  // Setup: no marker exists.
  const toolRuns = setUpHandoffPathMarker(on, false);

  // Action: a model writes a handoff file to any .idleState path.
  await $.tool.call({ tool: 'Write', file_path: '/work/p/.idleState/wrong.json', content: '{}' });

  // Verification: the call goes through.
  expect(toolRuns.count).toBe(1);
}

async function assertWriteOutsideIdleStateFolderGoesThroughWhenMarkerExists($: any, on: any) {
  // Setup: the marker names one handoff path.
  const toolRuns = setUpHandoffPathMarker(on, true);

  // Action: a model writes a json file outside any .idleState folder.
  await $.tool.call({ tool: 'Write', file_path: '/work/p/notes/other.json', content: '{}' });

  // Verification: the call goes through.
  expect(toolRuns.count).toBe(1);
}

test('tool.call denies a Write to a handoff path other than the marker path', assertWriteToOtherHandoffPathIsDeniedWhenMarkerExists);
test('tool.call saves no handoff path for a denied Write', assertDeniedHandoffPathIsNotSaved);
test('tool.call lets a Write to exactly the marker path go through', assertWriteToMarkedHandoffPathGoesThrough);
test('tool.call lets a Write to any handoff path go through when no marker exists', assertWriteToAnyHandoffPathGoesThroughWhenNoMarker);
test('tool.call lets a Write outside the .idleState folder go through when a marker exists', assertWriteOutsideIdleStateFolderGoesThroughWhenMarkerExists);
