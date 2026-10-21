import { noul, type JsonValue, type NoulResponse, type Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import { loadTaskList } from "./typesafe-checker";

const client = new TypeSafeClient();

const SCORE_THRESHOLD = 0.5;
const isPrintingRequests = process.argv.includes("--dry-run");
const idFlagIndex = process.argv.indexOf("--id");
const hasIdFlag = idFlagIndex >= 0;
const requestedReplyId = hasIdFlag ? process.argv[idFlagIndex + 1] : "";

type LabeledReply = { id: string; userPrompt: string; text: { category: string[]; text: string }[] };
type TaskSummary = { id: string; subject: string; status: string };
type ReplyState = { reply: { text: string }; userPrompt: string; taskList: TaskSummary[] };
type Span = { text: string; sourceText: string; location: number };
type Candidate = { id: string; text: string; sourceText: string; location: number };
type NormalizedItem = Record<string, any>;
type AskQuestion = { itemId: string; sourceText: string; question: unknown };
type TaskItem = { itemId: string; sourceText: string; work: unknown };
type TraceEntry = { node: string; focusId: string; score: number; isYes: boolean };
type ReplyRun = { id: string; elapsedSeconds: number; extractedItems: Candidate[]; normalizedItems: NormalizedItem[]; askQuestions: AskQuestion[]; taskItems: TaskItem[]; result: string; trace: TraceEntry[] };

const categoryLabels: { replies: LabeledReply[] } =
  await Bun.file(`${import.meta.dir}/category-labels.json`).json();

const RESULT_NONE = "none";
const RESULT_ASK = "ask";
const RESULT_TASK = "task";
const RESULT_BOTH = "both";

const HAIKU_SYSTEM_PROMPT = "You are a careful reader of assistant replies. Do the job you are given. Answer with a JSON object only.";

const LABELS = {
  B_SPLIT: "Split reply into sentences, clauses, and list entries",
  Q_MEANINGFUL: "Does the span communicate a distinct claim, question, action, or obligation?",
  Q_MULTIPLE: "Does the span contain multiple independently evaluable propositions?",
  B_SPLIT_SPAN: "Split into atomic propositions and return them to the input queue",
  Q_CONTEXT: "Does the candidate depend on another span for its meaning?",
  B_RESOLVE_CONTEXT: "Resolve pronouns, references, negation, and conditional language without changing meaning",
  Q_DUPLICATE: "Does this candidate refer to an existing candidate's same claim or obligation?",
  B_MERGE: "Merge source references and complementary details without losing distinct actions",
  B_SET_SUBJECT: "Identify subject: code, helper, bug, test, task, decision, other",
  B_SET_ACTION: "Identify speech act: report, question, request, commit, offer, recommend, assign",
  B_SET_STATUS: "Identify status: completed, unresolved, pending, blocked, hypothetical, unknown",
  B_SET_OWNER: "Identify responsible actor: agent, helper, user, external, unknown",
  B_SET_DEPENDENCIES: "Identify prerequisite decisions, permissions, resources, and related work",
  Q_EXPLICIT_QUESTION: "Is the candidate an explicit user-directed question or request for a decision?",
  B_SET_QUESTION: "Record exact question and requested answer",
  Q_WORK_REFERENCE: "Does the candidate reference a concrete work item?",
  B_IDENTIFY_WORK: "Identify action, target, expected outcome, and completion condition",
  Q_HAS_LINK: "Can the candidate be linked to an existing task, helper assignment, or related candidate?",
  B_LINK: "Record matching task IDs, helper IDs, and related candidate IDs",
  Q_UNCERTAIN: "Are any decision-relevant fields unknown or ambiguous?",
  B_MARK_UNKNOWN: "Preserve uncertainty explicitly; do not infer completion, ownership, or approval",
  Q_EXPLICIT: "Does the item explicitly ask the user a question or request a decision?",
  Q_BLOCKED: "Does the item describe work blocked by missing user input?",
  Q_AMBIGUOUS: "Does the item contain ambiguity that prevents required work?",
  Q_PERMISSION: "Does the item require user authorization or approval?",
  Q_ACTION: "Does the item describe concrete unfinished work?",
  Q_COMMITMENT: "Does the item contain an outstanding agent commitment?",
  Q_BUG: "Does the item report an unresolved bug, failure, or issue?",
  Q_PENDING: "Does the item describe a pending action needed to complete the request?",
  Q_OWNED: "Is the work already assigned to a helper?",
  Q_TRACKED: "Is the work already covered by the TaskList?",
};

// one request for one flowchart question: one noul yes/no question over the reply and the current focus
export function buildNodeRequest(replyState: ReplyState, nodeLabel: string, focusName: string, focus: unknown, extraState: Record<string, unknown>) {
  const state = { reply: replyState.reply, userPrompt: replyState.userPrompt, [focusName]: focus, ...extraState } as Record<string, JsonValue>;
  const instructions: Record<string, string> = {
    reply: "`reply.text`",
    userPrompt: "`userPrompt`",
    [focusName]: `\`${focusName}\``,
  };
  for (const extraName of Object.keys(extraState))
    instructions[extraName] = `\`${extraName}\``;
  instructions.question = `\`reply\` is a message an AI assistant wrote to the user at the end of its turn. ${nodeLabel}`;
  const questions: Questions = { answer: noul(instructions as any) };
  return { state, questions };
}

async function isNodeAnswerYes(replyState: ReplyState, nodeId: keyof typeof LABELS, focusName: string, focus: unknown, extraState: Record<string, unknown>, trace: TraceEntry[]) {
  const nodeRequest = buildNodeRequest(replyState, LABELS[nodeId], focusName, focus, extraState);
  console.log(`asking typesafe ${nodeId}`);
  console.log(JSON.stringify(nodeRequest, null, 2));
  await Bun.sleep(5000);
  const response = await client.systemOne(nodeRequest);
  const answer = response.answers.answer as NoulResponse;
  const isYes = answer.noul > SCORE_THRESHOLD;
  const focusFields = focus as { id?: string; text?: string };
  const hasFocusId = focusFields.id !== undefined;
  const focusId = (hasFocusId ? focusFields.id : focusFields.text) as string;
  trace.push({ node: nodeId, focusId, score: answer.noul, isYes });
  console.log("");
  return isYes;
}

async function spawnHaikuFields(job: string, replyText: string, item: unknown, context: Record<string, unknown>, fieldsShape: string) {
  const prompt = [
    `Job: ${job}`,
    `Reply:\n${replyText}`,
    `Current item (JSON):\n${JSON.stringify(item)}`,
    `Extra context (JSON):\n${JSON.stringify(context)}`,
    `Answer with only a JSON object with these fields: ${fieldsShape}`,
  ].join("\n\n");
  const spawnArgs = ["claude", "-p", "--model", "claude-haiku-5-5", "--setting-sources", "", "--system-prompt", HAIKU_SYSTEM_PROMPT, "--tools", "", "--no-session-persistence", "--disable-slash-commands", "--output-format", "json"];
  console.log("spawning haiku");
  console.log(spawnArgs.join(" "));
  console.log(prompt);
  await Bun.sleep(5000);
  const proc = Bun.spawn(
    spawnArgs,
    { stdin: new Blob([prompt]), stdout: "pipe", stderr: "pipe", cwd: import.meta.dir },
  );
  const [stdoutText, stderrText, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0)
    throw new Error(`exit ${exitCode}: ${stderrText}`);
  const envelope = JSON.parse(stdoutText);
  const modelText: string = envelope.result;
  const fieldsJson = modelText.slice(modelText.indexOf("{"), modelText.lastIndexOf("}") + 1);
  const fields = JSON.parse(fieldsJson);
  console.log("");
  return fields;
}

async function extractCandidates(replyState: ReplyState, trace: TraceEntry[]) {
  const replyText = replyState.reply.text;
  const splitReply = await spawnHaikuFields(LABELS.B_SPLIT, replyText, {}, {}, '{"spans": ["text copied exactly from the reply", ...]}');
  const spanQueue: Span[] = [];
  for (const spanText of splitReply.spans) {
    const location = replyText.indexOf(spanText);
    const isInReply = location >= 0;
    if (!isInReply)
      throw new Error(`B_SPLIT returned a span that is not in the reply: ${spanText}`);
    spanQueue.push({ text: spanText, sourceText: spanText, location });
  }

  const candidates: Candidate[] = [];
  let createdCount = 0;
  for (let spanIndex = 0; spanIndex < spanQueue.length; spanIndex++) {
    const span = spanQueue[spanIndex];

    const isMeaningful = await isNodeAnswerYes(replyState, "Q_MEANINGFUL", "span", span, {}, trace);
    if (!isMeaningful)
      continue;

    const isMultiple = await isNodeAnswerYes(replyState, "Q_MULTIPLE", "span", span, {}, trace);
    if (isMultiple) {
      const splitSpan = await spawnHaikuFields(LABELS.B_SPLIT_SPAN, replyText, span, {}, '{"propositions": ["one atomic proposition", ...]}');
      const hasManyPropositions = splitSpan.propositions.length > 1;
      if (!hasManyPropositions)
        throw new Error(`B_SPLIT_SPAN returned fewer than 2 propositions for: ${span.text}`);
      for (const propositionText of splitSpan.propositions)
        spanQueue.push({ text: propositionText, sourceText: span.sourceText, location: span.location });
      continue;
    }

    createdCount++;
    const candidate: Candidate = { id: `item_${createdCount}`, text: span.text, sourceText: span.sourceText, location: span.location };

    const isContextNeeded = await isNodeAnswerYes(replyState, "Q_CONTEXT", "candidate", candidate, {}, trace);
    if (isContextNeeded) {
      const resolved = await spawnHaikuFields(LABELS.B_RESOLVE_CONTEXT, replyText, candidate, {}, '{"text": "the candidate text with references resolved"}');
      candidate.text = resolved.text;
    }

    const isDuplicate = await isNodeAnswerYes(replyState, "Q_DUPLICATE", "candidate", candidate, { candidates }, trace);
    if (isDuplicate) {
      const merged = await spawnHaikuFields(LABELS.B_MERGE, replyText, candidate, { candidates }, '{"mergedIntoId": "id of the existing candidate", "text": "the merged text"}');
      let target: Candidate | undefined;
      for (const existing of candidates) {
        const isMergeTarget = existing.id === merged.mergedIntoId;
        if (isMergeTarget)
          target = existing;
      }
      if (target === undefined)
        throw new Error(`B_MERGE named an unknown candidate: ${merged.mergedIntoId}`);
      target.text = merged.text;
      target.sourceText = `${target.sourceText}\n${candidate.sourceText}`;
    }
    else
      candidates.push(candidate);
  }
  return candidates;
}

function validateNormalizedItem(item: NormalizedItem) {
  const requiredKeys = ["id", "sourceText", "subject", "speechAct", "status", "owner", "work", "question", "dependencies", "relatedItems", "existingTaskId", "helperAssignmentId", "uncertainties"];
  for (const key of requiredKeys) {
    const isMissing = item[key] === undefined;
    if (isMissing)
      throw new Error(`normalized item ${item.id} is missing ${key}`);
  }
  for (const key of ["category", "specific"]) {
    const isMissing = item.subject[key] === undefined;
    if (isMissing)
      throw new Error(`normalized item ${item.id} is missing subject.${key}`);
  }
}

async function normalizeCandidates(replyState: ReplyState, candidates: Candidate[], trace: TraceEntry[]) {
  const replyText = replyState.reply.text;
  const taskList = replyState.taskList;
  const normalizedItems: NormalizedItem[] = [];
  for (const candidate of candidates) {
    const item: NormalizedItem = { id: candidate.id, sourceText: candidate.sourceText, uncertainties: [] };
    const candidateContext = { candidate };
    const dependencyContext = { candidate, candidates };
    const linkContext = { candidate, candidates, taskList };

    const subjectFields = await spawnHaikuFields(LABELS.B_SET_SUBJECT, replyText, item, candidateContext, '{"category": "code, helper, bug, test, task, decision, or other", "specific": "short text"}');
    item.subject = { category: subjectFields.category, specific: subjectFields.specific };

    const actionFields = await spawnHaikuFields(LABELS.B_SET_ACTION, replyText, item, candidateContext, '{"speechAct": "report, question, request, commit, offer, recommend, or assign"}');
    item.speechAct = actionFields.speechAct;

    const statusFields = await spawnHaikuFields(LABELS.B_SET_STATUS, replyText, item, candidateContext, '{"status": "completed, unresolved, pending, blocked, hypothetical, or unknown"}');
    item.status = statusFields.status;

    const ownerFields = await spawnHaikuFields(LABELS.B_SET_OWNER, replyText, item, candidateContext, '{"owner": "agent, helper, user, external, or unknown"}');
    item.owner = ownerFields.owner;

    const dependencyFields = await spawnHaikuFields(LABELS.B_SET_DEPENDENCIES, replyText, item, dependencyContext, '{"dependencies": ["id of another candidate, or a short description", ...]}');
    item.dependencies = dependencyFields.dependencies;

    const isExplicitQuestion = await isNodeAnswerYes(replyState, "Q_EXPLICIT_QUESTION", "candidate", candidate, {}, trace);
    if (isExplicitQuestion) {
      const questionFields = await spawnHaikuFields(LABELS.B_SET_QUESTION, replyText, item, candidateContext, '{"question": {"text": "the exact question", "requestedAnswer": "the answer the reply wants"}}');
      item.question = questionFields.question;
    }
    else
      item.question = null;

    const isWorkReference = await isNodeAnswerYes(replyState, "Q_WORK_REFERENCE", "candidate", candidate, {}, trace);
    if (isWorkReference) {
      const workFields = await spawnHaikuFields(LABELS.B_IDENTIFY_WORK, replyText, item, candidateContext, '{"work": {"action": "text", "target": "text", "expectedOutcome": "text", "completionCondition": "text"}}');
      item.work = workFields.work;
    }
    else
      item.work = null;

    const isLinkable = await isNodeAnswerYes(replyState, "Q_HAS_LINK", "candidate", candidate, { taskList, candidates }, trace);
    if (isLinkable) {
      const linkFields = await spawnHaikuFields(LABELS.B_LINK, replyText, item, linkContext, '{"existingTaskId": "task id or null", "helperAssignmentId": "helper id or null", "relatedItems": ["candidate id", ...]}');
      item.existingTaskId = linkFields.existingTaskId;
      item.helperAssignmentId = linkFields.helperAssignmentId;
      item.relatedItems = linkFields.relatedItems;
    }
    else {
      item.existingTaskId = null;
      item.helperAssignmentId = null;
      item.relatedItems = [];
    }

    const isUncertain = await isNodeAnswerYes(replyState, "Q_UNCERTAIN", "item", item, {}, trace);
    if (isUncertain) {
      const uncertaintyFields = await spawnHaikuFields(LABELS.B_MARK_UNKNOWN, replyText, item, candidateContext, '{"uncertainties": ["short text for each unknown or ambiguous field", ...]}');
      item.uncertainties = uncertaintyFields.uncertainties;
    }

    validateNormalizedItem(item);
    normalizedItems.push(item);
  }
  return normalizedItems;
}

async function isAskNeeded(replyState: ReplyState, item: NormalizedItem, trace: TraceEntry[]) {
  let isAskFound = await isNodeAnswerYes(replyState, "Q_EXPLICIT", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_BLOCKED", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_AMBIGUOUS", "item", item, {}, trace);
  if (!isAskFound)
    isAskFound = await isNodeAnswerYes(replyState, "Q_PERMISSION", "item", item, {}, trace);
  return isAskFound;
}

async function isTaskNeeded(replyState: ReplyState, item: NormalizedItem, trace: TraceEntry[]) {
  const taskListState = { taskList: replyState.taskList };
  let isWorkFound = await isNodeAnswerYes(replyState, "Q_ACTION", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_COMMITMENT", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_BUG", "item", item, {}, trace);
  if (!isWorkFound)
    isWorkFound = await isNodeAnswerYes(replyState, "Q_PENDING", "item", item, {}, trace);
  if (!isWorkFound)
    return false;

  const isOwned = await isNodeAnswerYes(replyState, "Q_OWNED", "item", item, taskListState, trace);
  if (isOwned)
    return false;
  const isTracked = await isNodeAnswerYes(replyState, "Q_TRACKED", "item", item, taskListState, trace);
  if (isTracked)
    return false;
  return true;
}

async function computeReplyRun(id: string, replyState: ReplyState) {
  const startMilliseconds = Date.now();
  const trace: TraceEntry[] = [];
  const extractedItems = await extractCandidates(replyState, trace);
  const normalizedItems = await normalizeCandidates(replyState, extractedItems, trace);

  const askQuestions: AskQuestion[] = [];
  const taskItems: TaskItem[] = [];
  for (const item of normalizedItems) {
    const isAskRequired = await isAskNeeded(replyState, item, trace);
    if (isAskRequired) {
      askQuestions.push({ itemId: item.id, sourceText: item.sourceText, question: item.question });
      continue;
    }
    const isTaskRequired = await isTaskNeeded(replyState, item, trace);
    if (isTaskRequired)
      taskItems.push({ itemId: item.id, sourceText: item.sourceText, work: item.work });
  }

  let result = RESULT_NONE;
  const hasAsk = askQuestions.length > 0;
  if (hasAsk) {
    const hasTaskAfterAsk = taskItems.length > 0;
    result = hasTaskAfterAsk ? RESULT_BOTH : RESULT_ASK;
  }
  else {
    const hasTask = taskItems.length > 0;
    result = hasTask ? RESULT_TASK : RESULT_NONE;
  }
  const elapsedSeconds = (Date.now() - startMilliseconds) / 1000;
  const run: ReplyRun = { id, elapsedSeconds, extractedItems, normalizedItems, askQuestions, taskItems, result, trace };
  return run;
}

// bun mod/tests/typesafe-checker-5.ts [--dry-run] [--id <replyId>]; walks the checker-5 flowcharts for every reply in category-labels.json
if (import.meta.main) {
  const replies: { id: string; state: ReplyState }[] = [];
  let isRequestedReplyFound = false;
  for (const reply of categoryLabels.replies) {
    const isRequestedReply = reply.id === requestedReplyId;
    if (isRequestedReply)
      isRequestedReplyFound = true;
    const isSkipped = hasIdFlag && !isRequestedReply;
    if (isSkipped)
      continue;
    const lineTexts: string[] = [];
    for (const line of reply.text)
      lineTexts.push(line.text);
    replies.push({ id: reply.id, state: { reply: { text: lineTexts.join("\n") }, userPrompt: reply.userPrompt, taskList: [] } });
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
  const taskList = await loadTaskList();
  for (const reply of replies)
    reply.state.taskList = taskList;
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
