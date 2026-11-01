import { expect, test } from 'bun:test';
import { REPLY_CHECKS } from '../mod/hooks/register';
import { parseTranscript } from './parseTranscript';

let counter = 0;

function makeLine(type: string, content: unknown, extra: Record<string, unknown> = {}, messageId?: string) {
  counter++;
  return JSON.stringify({ type, uuid: `u${counter}`, sessionId: 's1', timestamp: '2026-10-30T06:00:00.000Z', message: { id: messageId, content }, ...extra });
}


const NEW_NUDGE_PATH = '/work/p/.claude_hooks/ask-dont-dump/s1.json';
const NEW_NUDGE_TEXT = `The ask-dont-dump plugin sent a message:\nask-dont-dump flagged your last reply. Read ${NEW_NUDGE_PATH} and do each item in its "do" list.`;

function makeNewFormatLines(hasReadResult: boolean) {
  const detailsJson = JSON.stringify([{ did: REPLY_CHECKS[1].did, do: 'a', proof: 'first phrase' }, { did: REPLY_CHECKS[3].did, do: 'b', proof: 'second phrase' }], null, 2);
  const numberedJson = detailsJson.split('\n').map((text, i) => `${String(i + 1).padStart(6, ' ')}→${text}`).join('\n');
  const readCall = [{ type: 'tool_use', id: 'read1', name: 'Read', input: { file_path: NEW_NUDGE_PATH } }];
  const lines = [
    makeLine('user', 'q', { origin: { kind: 'human' } }),
    makeLine('assistant', [{ type: 'text', text: 'the reply' }], {}, 'm1'),
    makeLine('user', NEW_NUDGE_TEXT, { origin: { kind: 'plugin', name: 'ask-dont-dump' } }),
    makeLine('assistant', readCall, {}, 'm2'),
  ];
  if (hasReadResult)
    lines.push(makeLine('user', [{ type: 'tool_result', tool_use_id: 'read1', content: numberedJson }]));
  lines.push(makeLine('assistant', [{ type: 'text', text: 'done' }], {}, 'm3'));
  return lines.join('\n');
}

test('a new-format nudge maps the details file to the checks and keeps the phrases', () => {
  const first = parseTranscript(makeNewFormatLines(true)).rows[0];
  const states = first.checks.map(check => check.state);
  expect(states).toEqual(['quiet', 'fired', 'quiet', 'fired', 'quiet', 'quiet']);
  expect(first.checks[1].phrase).toBe('first phrase');
  expect(first.checks[3].phrase).toBe('second phrase');
  expect(parseTranscript(makeNewFormatLines(true)).rows[1].checks[0].state).toBe('not checked');
});

test('a new-format nudge with no Read result marks every check as details not read', () => {
  const first = parseTranscript(makeNewFormatLines(false)).rows[0];
  expect(first.checks.every(check => check.state === 'fired (details not read)')).toBe(true);
});

test('a nudge with no reply before it throws', () => {
  const lone = makeLine('user', NEW_NUDGE_TEXT, { origin: { kind: 'plugin', name: 'ask-dont-dump' } });
  expect(() => parseTranscript(lone)).toThrow();
});

test('a chat log that starts before the audit start throws', () => {
  const early = makeLine('user', 'q', { origin: { kind: 'human' }, timestamp: '2026-10-30T05:59:59.000Z' });
  expect(() => parseTranscript(early)).toThrow('before the audit start');
});
