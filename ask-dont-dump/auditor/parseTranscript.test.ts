import { expect, test } from 'bun:test';
import { REPLY_CHECKS } from '../mod/hooks/register';
import { parseTranscript } from './parseTranscript';
// import { OLD_BUG_REPORT_TEXT, OLD_QUESTION_OR_CHOICE_TEXT } from './oldNudgeTexts';

let counter = 0;

function makeLine(type: string, content: unknown, extra: Record<string, unknown> = {}, messageId?: string) {
  counter++;
  return JSON.stringify({ type, uuid: `u${counter}`, sessionId: 's1', timestamp: '2026-10-30T06:00:00.000Z', message: { id: messageId, content }, ...extra });
}

// const NUDGE_TEXT = `The ask-dont-dump plugin sent a message:\n${OLD_BUG_REPORT_TEXT}\n\n${OLD_QUESTION_OR_CHOICE_TEXT}`;
//
// function makeTranscript() {
//   return [
//     makeLine('user', 'first question', { origin: { kind: 'human' } }),
//     makeLine('assistant', [{ type: 'text', text: 'early words' }], {}, 'm1'),
//     makeLine('assistant', [{ type: 'tool_use' }], {}, 'm1'),
//     makeLine('user', [{ type: 'tool_result' }]),
//     makeLine('assistant', [{ type: 'text', text: 'line one' }], {}, 'm2'),
//     makeLine('assistant', [{ type: 'text', text: 'line two' }], {}, 'm2'),
//     makeLine('assistant', [{ type: 'text', text: 'side words' }], { isSidechain: true }, 'm9'),
//     makeLine('user', NUDGE_TEXT, { origin: { kind: 'plugin', name: 'ask-dont-dump' } }),
//     makeLine('assistant', [{ type: 'text', text: 'answer to nudge' }], {}, 'm3'),
//     makeLine('user', 'second question', { origin: { kind: 'human' } }),
//     makeLine('assistant', [{ type: 'text', text: 'see #12' }], {}, 'm4'),
//   ].join('\n');
// }
//
// test('a nudge maps to the reply before it and its checks', () => {
//   const parsed = parseTranscript(makeTranscript());
//   const first = parsed.rows[0];
//   expect(parsed.sessionId).toBe('s1');
//   expect(first.promptText).toBe('first question');
//   expect(first.checks[0].state).toBe('fired');
//   expect(first.checks[1].state).toBe('fired');
//   expect(first.checks[2].state).toBe('quiet');
// });
//
// test('the reply after a nudge is not checked', () => {
//   const second = parseTranscript(makeTranscript()).rows[1];
//   expect(second.replyText).toBe('answer to nudge');
//   expect(second.checks.every(check => check.state === 'not checked')).toBe(true);
// });
//
// test('sidechain lines are ignored and a multi-line message is joined', () => {
//   const parsed = parseTranscript(makeTranscript());
//   expect(parsed.rows[0].replyText).toBe('line one\n\nline two');
//   expect(parsed.rows.length).toBe(3);
// });
//
// test('a task number makes skipsListedTasks checks maybe skipped', () => {
//   const third = parseTranscript(makeTranscript()).rows[2];
//   expect(third.checks[0].state).toBe('quiet (maybe task-list skip)');
//   expect(third.checks[1].state).toBe('quiet');
// });
//
// test('a prompt with no reply between the reply and the nudge is skipped', () => {
//   const lines = [
//     makeLine('user', 'q', { origin: { kind: 'human' } }),
//     makeLine('assistant', [{ type: 'text', text: 'the reply' }], {}, 'm1'),
//     makeLine('user', 'task done', { origin: { kind: 'task-notification' } }),
//     makeLine('user', NUDGE_TEXT, { origin: { kind: 'plugin', name: 'ask-dont-dump' } }),
//     makeLine('assistant', [{ type: 'text', text: 'ok' }], {}, 'm2'),
//   ];
//   const parsed = parseTranscript(lines.join('\n'));
//   expect(parsed.rows[0].checks[0].state).toBe('fired');
//   expect(parsed.rows.length).toBe(2);
// });

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
