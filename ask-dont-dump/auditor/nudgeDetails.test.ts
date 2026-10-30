import { expect, test } from 'bun:test';
import { addReadCalls, addReadResults, containsToolResult, findNudgeDetails, isNewFormatNudge, type ReadCall } from './nudgeDetails';

const PATH = '/work/p/.claude_hooks/ask-dont-dump/s1.json';
const NUDGE_TEXT = `ask-dont-dump flagged your last reply. Read ${PATH} and do each item in its "do" list.`;
const DETAILS = [{ did: 'Reported a bug', do: 'Fix it', proof: 'There is a crash.' }];
// const OLD_DETAILS = { did: ['Reported a bug'], do: ['Fix it'], phrases: ['There is a crash.'] };

function makeReads(turnIndex: number, resultText?: string) {
  const reads: ReadCall[] = [];
  addReadCalls(reads, turnIndex, [{ type: 'tool_use', id: 'r1', name: 'Read', input: { file_path: PATH } }]);
  if (resultText !== undefined)
    addReadResults(reads, [{ type: 'tool_result', tool_use_id: 'r1', content: resultText }]);
  return reads;
}

test('a Read result with line numbers parses into the details', () => {
  const numbered = JSON.stringify(DETAILS, null, 2).split('\n').map((text, i) => `     ${i + 1}→${text}`).join('\n');
  expect(findNudgeDetails(makeReads(3, numbered), NUDGE_TEXT, 3, 5)).toEqual(DETAILS);
});

// test('an old-shape Read result still parses into the array', () => {
//   const numbered = JSON.stringify(OLD_DETAILS, null, 2).split('\n').map((text, i) => `     ${i + 1}→${text}`).join('\n');
//   expect(findNudgeDetails(makeReads(3, numbered), NUDGE_TEXT, 3, 5)).toEqual(DETAILS);
// });

test('an old-shape Read result throws', () => {
  const oldShape = JSON.stringify({ did: [], do: [], phrases: [] }, null, 2);
  expect(() => findNudgeDetails(makeReads(3, oldShape), NUDGE_TEXT, 3, 5)).toThrow();
});

test('a Read outside the nudge window is ignored', () => {
  const reads = makeReads(7, JSON.stringify(DETAILS));
  expect(findNudgeDetails(reads, NUDGE_TEXT, 3, 5)).toBeUndefined();
});

test('a Read with no result gives no details', () => {
  expect(findNudgeDetails(makeReads(3), NUDGE_TEXT, 3, 5)).toBeUndefined();
});

test('only Read tool calls are tracked', () => {
  const reads: ReadCall[] = [];
  addReadCalls(reads, 0, [{ type: 'tool_use', id: 'b1', name: 'Bash', input: {} }]);
  expect(reads).toHaveLength(0);
});

test('the new nudge format is told from the old one', () => {
  expect(isNewFormatNudge(NUDGE_TEXT)).toBe(true);
  expect(isNewFormatNudge('Your last message reported a bug.')).toBe(false);
});

test('a tool_result block is told from plain text', () => {
  expect(containsToolResult([{ type: 'tool_result' }])).toBe(true);
  expect(containsToolResult('hello')).toBe(false);
});
