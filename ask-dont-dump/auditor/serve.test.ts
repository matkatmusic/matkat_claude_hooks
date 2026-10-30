import { expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import { applyMarkRequest, buildPage } from './serve';

const TRANSCRIPT_PATH = `${tmpdir()}/auditor-serve-test-transcript.jsonl`;
const REPLY_TEXT = 'a reply with <b>markup</b>';

async function writeTranscript() {
  const prompt = { type: 'user', uuid: 'u1', sessionId: 'serve-test', timestamp: '2026-10-30T06:00:00.000Z', origin: { kind: 'human' }, message: { content: 'a question' } };
  const reply = { type: 'assistant', uuid: 'u2', sessionId: 'serve-test', timestamp: '2026-10-30T06:00:01.000Z', message: { id: 'm1', content: [{ type: 'text', text: REPLY_TEXT }] } };
  await Bun.write(TRANSCRIPT_PATH, `${JSON.stringify(prompt)}\n${JSON.stringify(reply)}\n`);
}

function makeMarkRequest(body: object) {
  return new Request('http://127.0.0.1/mark', { method: 'POST', body: JSON.stringify(body) });
}

test('the page embeds the replies and escapes the less-than sign', async () => {
  await writeTranscript();
  const page = await buildPage(TRANSCRIPT_PATH);
  expect(page).toContain('a reply with \\u003cb>markup\\u003c/b>');
  expect(page).not.toContain(REPLY_TEXT);
  expect(page).not.toContain('__DATA_JSON__');
});

test('a mark with an unknown verdict is denied', async () => {
  await writeTranscript();
  const response = await applyMarkRequest(makeMarkRequest({ replyUuid: 'u2', question: 'q', verdict: 'maybe', reason: '', note: '' }), TRANSCRIPT_PATH);
  expect(response.status).toBe(400);
});

test('a mark for an unknown reply is denied', async () => {
  await writeTranscript();
  const response = await applyMarkRequest(makeMarkRequest({ replyUuid: 'nope', question: 'q', verdict: 'wrong', reason: '', note: '' }), TRANSCRIPT_PATH);
  expect(response.status).toBe(400);
});
