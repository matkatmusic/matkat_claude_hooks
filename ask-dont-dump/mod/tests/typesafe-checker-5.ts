import { buildNodeRequest, LABELS, loadReplyState, SCORE_THRESHOLD, type LabeledReply, type ReplyRun, type ReplyState, type Span, type TraceEntry } from "./checker5Calls";
import { extractCandidates } from "./extractItems";
import { normalizeCandidates } from "./normalizeItems";
import { decideAskOrTask } from "./askOrTaskItems";

const isPrintingRequests = process.argv.includes("--dry-run");
const idFlagIndex = process.argv.indexOf("--id");
const hasIdFlag = idFlagIndex >= 0;
const requestedReplyId = hasIdFlag ? process.argv[idFlagIndex + 1] : "";

async function computeReplyRun(id: string, replyState: ReplyState) {
  const startMilliseconds = Date.now();
  const trace: TraceEntry[] = [];
  const extractedItems = await extractCandidates(replyState, trace);
  const normalizedItems = await normalizeCandidates(replyState, extractedItems, trace);
  const { askQuestions, taskItems, result } = await decideAskOrTask(replyState, normalizedItems, trace);
  const elapsedSeconds = (Date.now() - startMilliseconds) / 1000;
  const run: ReplyRun = { id, elapsedSeconds, extractedItems, normalizedItems, askQuestions, taskItems, result, trace };
  return run;
}

// bun mod/tests/typesafe-checker-5.ts [--dry-run] [--id <replyId>]; walks the checker-5 flowcharts for every reply in category-labels.json
if (import.meta.main) {
  const isMissingIdValue = hasIdFlag && requestedReplyId === undefined;
  if (isMissingIdValue)
    throw new Error("missing --id <replyId>");
  const categoryLabels: { replies: LabeledReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  const replies: { id: string; state: ReplyState }[] = [];
  let isRequestedReplyFound = false;
  for (const reply of categoryLabels.replies) {
    const isRequestedReply = reply.id === requestedReplyId;
    if (isRequestedReply)
      isRequestedReplyFound = true;
    const isSkipped = hasIdFlag && !isRequestedReply;
    if (isSkipped)
      continue;
    replies.push({ id: reply.id, state: await loadReplyState(reply.id) });
  }
  const isMissingRequestedReply = hasIdFlag && !isRequestedReplyFound;
  if (isMissingRequestedReply)
    throw new Error(`no reply has id: ${requestedReplyId}`);
  if (isPrintingRequests) {
    const firstState = replies[0].state;
    const wholeReplySpan: Span = { text: firstState.reply.text, sourceText: firstState.reply.text, location: 0 };
    console.log(JSON.stringify(buildNodeRequest(firstState, LABELS.Q_MEANINGFUL, "span", wholeReplySpan, {}), null, 2));
    process.exit(0);
  }
  const replyRuns: ReplyRun[] = [];
  // ponytail: 4 replies at a time; the SDK retries 429s
  for (let i = 0; i < replies.length; i += 4) {
    const batch = replies.slice(i, i + 4);
    const pending: Promise<ReplyRun>[] = [];
    for (const reply of batch)
      pending.push(computeReplyRun(reply.id, reply.state));
    const runs = await Promise.all(pending);
    for (const run of runs) {
      const { trace: traceOmittedFromLine, ...runWithoutTrace } = run;
      console.log(JSON.stringify(runWithoutTrace));
      replyRuns.push(run);
    }
  }
  const isoTime = new Date().toISOString();
  const timestamp = isoTime.slice(0, 19).replaceAll(":", "-");
  const outPath = `${import.meta.dir}/results/typesafe5-${timestamp}.json`;
  await Bun.write(outPath, JSON.stringify({ threshold: SCORE_THRESHOLD, replies: replyRuns }, null, 2));
  console.log(outPath);
}
