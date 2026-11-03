import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { parseTranscript, type ParsedTranscript } from './parseTranscript';

const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4318;
const DATA_MARKER = '__DATA_JSON__';
const PAGE_PATH = `${import.meta.dir}/page.html`;
const MARKS_DIR = `${import.meta.dir}/marks`;
const VERDICTS = ['correct', 'wrong', 'missed'];
const EXPECTED_ACTIONS = ['ask', 'task', 'askAndTask', 'none'];

type CheckMark = { state: string; phrase: string; verdict: string | null; reason: string; note: string };
type ReplyMark = { promptText: string; replyText: string; checks: Record<string, CheckMark> };
type MarksFile = { transcriptPath: string; replies: Record<string, ReplyMark>; expectedActions: Record<string, string> };
type MarkBody = { replyUuid?: unknown; question?: unknown; verdict?: unknown; reason?: unknown; note?: unknown };
type ExpectedActionBody = { replyUuid?: unknown; expectedAction?: unknown };

async function loadMarks(transcriptPath: string, sessionId: string): Promise<MarksFile> {
  const marksFile = Bun.file(`${MARKS_DIR}/${sessionId}.json`);
  const hasMarksFile = await marksFile.exists();
  if (!hasMarksFile) {
    const tildePath = transcriptPath.replace(homedir(), '~');
    return { transcriptPath: tildePath, replies: {}, expectedActions: {} };
  }
  return await marksFile.json();
}

async function loadParsed(transcriptPath: string): Promise<ParsedTranscript> {
  return parseTranscript(await Bun.file(transcriptPath).text());
}

export async function buildPage(transcriptPath: string) {
  const parsed = await loadParsed(transcriptPath);
  const marks = await loadMarks(transcriptPath, parsed.sessionId);
  const pageData = { transcriptPath, rows: parsed.rows, marks: marks.replies, expectedActions: marks.expectedActions };
  const safeJson = JSON.stringify(pageData).replaceAll('<', '\\u003c');
  const template = await Bun.file(PAGE_PATH).text();
  function getSafeJson() {
    return safeJson;
  }
  return template.replace(DATA_MARKER, getSafeJson);
}

function denyMark(message: string) {
  return new Response(message, { status: 400 });
}

export async function applyMarkRequest(request: Request, transcriptPath: string) {
  const body = (await request.json()) as MarkBody;
  const { replyUuid, question, verdict, reason, note } = body;
  const isVerdictValid = typeof verdict === 'string' && VERDICTS.includes(verdict);
  if (!isVerdictValid)
    return denyMark('verdict must be correct, wrong or missed');
  const isTextValid = typeof reason === 'string' && typeof note === 'string';
  if (!isTextValid)
    return denyMark('reason and note must be strings');
  const parsed = await loadParsed(transcriptPath);
  let foundRow: ParsedTranscript['rows'][number] | undefined;
  for (const row of parsed.rows) {
    if (row.uuid === replyUuid)
      foundRow = row;
  }
  if (foundRow === undefined)
    return denyMark('unknown replyUuid');
  const marks = await loadMarks(transcriptPath, parsed.sessionId);
  let replyMark = marks.replies[foundRow.uuid];
  if (replyMark === undefined) {
    const checks: Record<string, CheckMark> = {};
    for (const check of foundRow.checks)
      checks[check.question] = { state: check.state, phrase: check.phrase, verdict: null, reason: '', note: '' };
    replyMark = { promptText: foundRow.promptText, replyText: foundRow.replyText, checks };
    marks.replies[foundRow.uuid] = replyMark;
  }
  const checkMark = replyMark.checks[question as string];
  if (checkMark === undefined)
    return denyMark('unknown question');
  checkMark.verdict = verdict;
  checkMark.reason = reason;
  checkMark.note = note;
  await Bun.write(`${MARKS_DIR}/${parsed.sessionId}.json`, JSON.stringify(marks, null, 2) + '\n');
  return Response.json(checkMark);
}

export async function applyExpectedActionRequest(request: Request, transcriptPath: string) {
  const body = (await request.json()) as ExpectedActionBody;
  const { replyUuid, expectedAction } = body;
  const isActionValid = typeof expectedAction === 'string' && EXPECTED_ACTIONS.includes(expectedAction);
  if (!isActionValid)
    return denyMark('expectedAction must be ask, task, askAndTask or none');
  const parsed = await loadParsed(transcriptPath);
  let isReplyFound = false;
  for (const row of parsed.rows) {
    if (row.uuid === replyUuid)
      isReplyFound = true;
  }
  if (!isReplyFound)
    return denyMark('unknown replyUuid');
  const marks = await loadMarks(transcriptPath, parsed.sessionId);
  marks.expectedActions[replyUuid as string] = expectedAction;
  await Bun.write(`${MARKS_DIR}/${parsed.sessionId}.json`, JSON.stringify(marks, null, 2) + '\n');
  return Response.json({ expectedAction });
}

export async function buildBatchState(transcriptPath: string) {
  const parsed = await loadParsed(transcriptPath);
  const marks = await loadMarks(transcriptPath, parsed.sessionId);
  const settings = await Bun.file(`${parsed.projectRoot}/.claude/settings.json`).json();
  const taskListId = settings.env?.CLAUDE_CODE_TASK_LIST_ID;
  if (taskListId === undefined)
    throw new Error(`${parsed.projectRoot}/.claude/settings.json has no env.CLAUDE_CODE_TASK_LIST_ID`);
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? `${homedir()}/.claude`;
  const taskDir = `${configDir}/tasks/${taskListId}`;
  // Integer keys iterate in numeric order.
  const openSubjects: Record<number, string> = {};
  for (const fileName of await readdir(taskDir)) {
    const isTaskFile = fileName.endsWith('.json');
    if (!isTaskFile)
      continue;
    const task = await Bun.file(`${taskDir}/${fileName}`).json();
    const isOpen = task.status === 'pending' || task.status === 'in_progress';
    if (isOpen)
      openSubjects[Number(task.id)] = task.subject;
  }
  const taskLines: string[] = [];
  for (const id of Object.keys(openSubjects))
    taskLines.push(`#${id} ${openSubjects[Number(id)]}`);
  const openTasks = taskLines.join('\n');
  const batchState = [];
  for (const row of parsed.rows) {
    const expectedAction = marks.expectedActions[row.uuid];
    if (expectedAction === undefined)
      throw new Error(`reply ${row.uuid} has no expectedAction`);
    // batchState.push({ agentReply: row.replyText, userPrompt: row.promptText, openTasks, expectedAction });
    batchState.push({ agentReply: row.replyText, userPrompt: row.promptText, openTasks });
  }
  return batchState;
}

// bun claude/claude_hooks/ask-dont-dump/auditor/serve.ts <transcript_path>
if (import.meta.main) {
  const transcriptPath = process.argv[2];
  const isJsonlPath = transcriptPath !== undefined && transcriptPath.endsWith('.jsonl');
  if (!isJsonlPath)
    throw new Error('usage: serve.ts <transcript_path.jsonl>');
  const server = Bun.serve({
    hostname: SERVER_HOSTNAME,
    port: SERVER_PORT,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      const isMarkPost = request.method === 'POST' && pathname === '/mark';
      if (isMarkPost)
        return applyMarkRequest(request, transcriptPath);
      const isExpectedActionPost = request.method === 'POST' && pathname === '/expected-action';
      if (isExpectedActionPost)
        return applyExpectedActionRequest(request, transcriptPath);
      const isBatchStateGet = request.method === 'GET' && pathname === '/batch-state';
      if (isBatchStateGet)
        return Response.json(await buildBatchState(transcriptPath));
      const isPageGet =request.method === 'GET' && pathname === '/';
      if (isPageGet)
        return new Response(await buildPage(transcriptPath), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`http://${SERVER_HOSTNAME}:${server.port}/`);
}
