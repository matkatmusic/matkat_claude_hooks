import { parseTranscript, type ParsedTranscript } from './parseTranscript';

const SERVER_HOSTNAME = '127.0.0.1';
const SERVER_PORT = 4318;
const DATA_MARKER = '__DATA_JSON__';
const PAGE_PATH = `${import.meta.dir}/page.html`;
const MARKS_DIR = `${import.meta.dir}/marks`;
const VERDICTS = ['correct', 'wrong', 'missed'];

type CheckMark = { state: string; phrase: string; verdict: string | null; reason: string; note: string };
type ReplyMark = { promptText: string; replyText: string; checks: Record<string, CheckMark> };
type MarksFile = { transcriptPath: string; replies: Record<string, ReplyMark> };
type MarkBody = { replyUuid?: unknown; question?: unknown; verdict?: unknown; reason?: unknown; note?: unknown };

async function loadMarks(transcriptPath: string, sessionId: string): Promise<MarksFile> {
  const marksFile = Bun.file(`${MARKS_DIR}/${sessionId}.json`);
  const hasMarksFile = await marksFile.exists();
  if (!hasMarksFile)
    return { transcriptPath, replies: {} };
  return await marksFile.json();
}

async function loadParsed(transcriptPath: string): Promise<ParsedTranscript> {
  return parseTranscript(await Bun.file(transcriptPath).text());
}

async function buildPage(transcriptPath: string) {
  const parsed = await loadParsed(transcriptPath);
  const marks = await loadMarks(transcriptPath, parsed.sessionId);
  const pageData = { transcriptPath, rows: parsed.rows, marks: marks.replies };
  const safeJson = JSON.stringify(pageData).replaceAll('<', '\\u003c');
  const template = await Bun.file(PAGE_PATH).text();
  return template.replace(DATA_MARKER, () => safeJson);
}

function rejectMark(message: string) {
  return new Response(message, { status: 400 });
}

async function handleMarkRequest(request: Request, transcriptPath: string) {
  const body = (await request.json()) as MarkBody;
  const { replyUuid, question, verdict, reason, note } = body;
  const isVerdictValid = typeof verdict === 'string' && VERDICTS.includes(verdict);
  if (!isVerdictValid)
    return rejectMark('verdict must be correct, wrong or missed');
  const isTextValid = typeof reason === 'string' && typeof note === 'string';
  if (!isTextValid)
    return rejectMark('reason and note must be strings');
  const parsed = await loadParsed(transcriptPath);
  let foundRow: ParsedTranscript['rows'][number] | undefined;
  for (const row of parsed.rows) {
    if (row.uuid === replyUuid)
      foundRow = row;
  }
  if (foundRow === undefined)
    return rejectMark('unknown replyUuid');
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
    return rejectMark('unknown question');
  checkMark.verdict = verdict;
  checkMark.reason = reason;
  checkMark.note = note;
  await Bun.write(`${MARKS_DIR}/${parsed.sessionId}.json`, JSON.stringify(marks, null, 2) + '\n');
  return Response.json(checkMark);
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
        return handleMarkRequest(request, transcriptPath);
      const isPageGet = request.method === 'GET' && pathname === '/';
      if (isPageGet)
        return new Response(await buildPage(transcriptPath), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`http://${SERVER_HOSTNAME}:${server.port}/`);
}
