import { isNodeAnswerYes, LABELS, spawnHaikuFields, writeStageResult, type Candidate, type NormalizedItem, type ReplyState, type TraceEntry } from "./checker5Calls";

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

export async function normalizeCandidates(replyState: ReplyState, candidates: Candidate[], trace: TraceEntry[]) {
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

// bun mod/tests/normalizeItems.ts --from <extract results file>; walks normalize-extracted-item.mmd for one reply
if (import.meta.main) {
  const fromFlagIndex = process.argv.indexOf("--from");
  const fromPath = process.argv[fromFlagIndex + 1];
  const isMissingFrom = fromFlagIndex < 0 || fromPath === undefined;
  if (isMissingFrom)
    throw new Error("missing --from <extract results file>");
  const extractResult = await Bun.file(fromPath).json();
  const { id, replyState, extractedItems } = extractResult;
  const startMilliseconds = Date.now();
  const trace: TraceEntry[] = [];
  const normalizedItems = await normalizeCandidates(replyState, extractedItems, trace);
  const elapsedSeconds = (Date.now() - startMilliseconds) / 1000;
  const outPath = await writeStageResult("normalize", id, { id, replyState, extractedItems, normalizedItems, trace, elapsedSeconds });
  console.log(outPath);
}
