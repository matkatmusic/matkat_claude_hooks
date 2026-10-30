import { expect, test } from 'bun:test';
import { rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { parseTranscript } from './parseTranscript';
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

test('a new marks file stores the transcript path with the home folder as a tilde', async () => {
  const homeTranscriptPath = `${homedir()}/auditor-home-test-transcript.jsonl`;
  const homeMarksPath = `${import.meta.dir}/marks/home-test.json`;
  const prompt = { type: 'user', uuid: 'u1', sessionId: 'home-test', timestamp: '2026-10-30T06:00:00.000Z', origin: { kind: 'human' }, message: { content: 'a question' } };
  const reply = { type: 'assistant', uuid: 'u2', sessionId: 'home-test', timestamp: '2026-10-30T06:00:01.000Z', message: { id: 'm1', content: [{ type: 'text', text: REPLY_TEXT }] } };
  await Bun.write(homeTranscriptPath, `${JSON.stringify(prompt)}\n${JSON.stringify(reply)}\n`);
  const parsed = parseTranscript(await Bun.file(homeTranscriptPath).text());
  const firstQuestion = parsed.rows[0].checks[0].question;
  await applyMarkRequest(makeMarkRequest({ replyUuid: 'u2', question: firstQuestion, verdict: 'wrong', reason: '', note: '' }), homeTranscriptPath);
  const marksText = await Bun.file(homeMarksPath).text();
  rmSync(homeMarksPath);
  rmSync(homeTranscriptPath);
  const marks = JSON.parse(marksText);
  expect(marks.transcriptPath.startsWith('~')).toBe(true);
  expect(marksText).not.toContain(homedir());
});

test('a mark for an unknown reply is denied', async () => {
  await writeTranscript();
  const response = await applyMarkRequest(makeMarkRequest({ replyUuid: 'nope', question: 'q', verdict: 'wrong', reason: '', note: '' }), TRANSCRIPT_PATH);
  expect(response.status).toBe(400);
});
