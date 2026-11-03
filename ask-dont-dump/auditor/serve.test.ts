import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { parseTranscript } from './parseTranscript';
import { applyExpectedActionRequest, applyMarkRequest, buildBatchState, buildPage } from './serve';

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

test('a mark with an unknown expectedAction is denied', async () => {
  await writeTranscript();
  const response = await applyExpectedActionRequest(makeMarkRequest({ replyUuid: 'u2', expectedAction: 'maybe' }), TRANSCRIPT_PATH);
  expect(response.status).toBe(400);
});

test('a valid expectedAction saves and the batch state lists only open tasks in number order', async () => {
  const projectDir = mkdtempSync(`${tmpdir()}/auditor-batch-project-`);
  const configDir = mkdtempSync(`${tmpdir()}/auditor-batch-config-`);
  const batchTranscriptPath = `${tmpdir()}/auditor-batch-test-transcript.jsonl`;
  const batchMarksPath = `${import.meta.dir}/marks/batch-test.json`;
  const oldConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  await Bun.write(`${projectDir}/.claude/settings.json`, JSON.stringify({ env: { CLAUDE_CODE_TASK_LIST_ID: 'list-1' } }));
  await Bun.write(`${configDir}/tasks/list-1/10.json`, JSON.stringify({ id: '10', subject: 'ten', status: 'pending' }));
  await Bun.write(`${configDir}/tasks/list-1/2.json`, JSON.stringify({ id: '2', subject: 'two', status: 'in_progress' }));
  await Bun.write(`${configDir}/tasks/list-1/5.json`, JSON.stringify({ id: '5', subject: 'five', status: 'completed' }));
  const prompt = { type: 'user', uuid: 'u1', sessionId: 'batch-test', cwd: projectDir, timestamp: '2026-10-30T06:00:00.000Z', origin: { kind: 'human' }, message: { content: 'a question' } };
  const reply = { type: 'assistant', uuid: 'u2', sessionId: 'batch-test', cwd: projectDir, timestamp: '2026-10-30T06:00:01.000Z', message: { id: 'm1', content: [{ type: 'text', text: REPLY_TEXT }] } };
  await Bun.write(batchTranscriptPath, `${JSON.stringify(prompt)}\n${JSON.stringify(reply)}\n`);
  const response = await applyExpectedActionRequest(makeMarkRequest({ replyUuid: 'u2', expectedAction: 'askAndTask' }), batchTranscriptPath);
  const batchState = await buildBatchState(batchTranscriptPath);
  rmSync(batchMarksPath);
  rmSync(batchTranscriptPath);
  rmSync(projectDir, { recursive: true });
  rmSync(configDir, { recursive: true });
  if (oldConfigDir === undefined)
    delete process.env.CLAUDE_CONFIG_DIR;
  else
    process.env.CLAUDE_CONFIG_DIR = oldConfigDir;
  expect(response.status).toBe(200);
  // expect(batchState).toEqual([{ agentReply: REPLY_TEXT, userPrompt: 'a question', openTasks: '#2 two\n#10 ten', expectedAction: 'askAndTask' }]);
  expect(batchState).toEqual([{ agentReply: REPLY_TEXT, userPrompt: 'a question', openTasks: '#2 two\n#10 ten' }]);
  expect(batchState[0]).not.toHaveProperty('expectedAction');
});

test('the batch state throws when a reply has no expectedAction', async () => {
  const projectDir = mkdtempSync(`${tmpdir()}/auditor-batch-project-`);
  const configDir = mkdtempSync(`${tmpdir()}/auditor-batch-config-`);
  const missingTranscriptPath = `${tmpdir()}/auditor-missing-test-transcript.jsonl`;
  const oldConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  await Bun.write(`${projectDir}/.claude/settings.json`, JSON.stringify({ env: { CLAUDE_CODE_TASK_LIST_ID: 'list-1' } }));
  await Bun.write(`${configDir}/tasks/list-1/1.json`, JSON.stringify({ id: '1', subject: 'one', status: 'pending' }));
  const prompt = { type: 'user', uuid: 'u1', sessionId: 'missing-test', cwd: projectDir, timestamp: '2026-10-30T06:00:00.000Z', origin: { kind: 'human' }, message: { content: 'a question' } };
  const reply = { type: 'assistant', uuid: 'u2', sessionId: 'missing-test', cwd: projectDir, timestamp: '2026-10-30T06:00:01.000Z', message: { id: 'm1', content: [{ type: 'text', text: REPLY_TEXT }] } };
  await Bun.write(missingTranscriptPath, `${JSON.stringify(prompt)}\n${JSON.stringify(reply)}\n`);
  let thrownMessage = '';
  try {
    await buildBatchState(missingTranscriptPath);
  }
  catch (error) {
    thrownMessage = (error as Error).message;
  }
  rmSync(missingTranscriptPath);
  rmSync(projectDir, { recursive: true });
  rmSync(configDir, { recursive: true });
  if (oldConfigDir === undefined)
    delete process.env.CLAUDE_CONFIG_DIR;
  else
    process.env.CLAUDE_CONFIG_DIR = oldConfigDir;
  expect(thrownMessage).toContain('u2');
});
