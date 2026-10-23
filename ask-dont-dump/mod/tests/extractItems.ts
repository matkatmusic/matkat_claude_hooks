import { isNodeAnswerYes, LABELS, loadReplyState, spawnHaikuFields, writeStageResult, type Candidate, type ReplyState, type Span, type TraceEntry } from "./checker5Calls";

export async function extractCandidates(replyState: ReplyState, trace: TraceEntry[]) {
  const replyText = replyState.reply.text;
  const splitReply = await spawnHaikuFields(LABELS.B_SPLIT, replyText, {}, {}, '{"spans": ["text copied exactly from the reply", ...]}. Each part of the reply goes in exactly one span. Spans never overlap: do not add a piece of a sentence that is already in another span, and do not repeat a list line.');
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
      // const merged = await spawnHaikuFields(LABELS.B_MERGE, replyText, candidate, { candidates }, '{"mergedIntoId": "id of the existing candidate", "text": "the merged text"}');
      const merged = await spawnHaikuFields(LABELS.B_MERGE, replyText, candidate, { candidates }, '{"mergedIntoId": "id of one candidate in candidates, never the current candidate\'s id; null if no candidate in candidates states the same claim or obligation", "text": "the merged text, or null"}');
      const isNoMatch = merged.mergedIntoId === null;
      if (isNoMatch) {
        candidates.push(candidate);
        continue;
      }
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

// bun mod/tests/extractItems.ts --id <replyId>; walks distinct-item-extraction.mmd for one reply
if (import.meta.main) {
  const idFlagIndex = process.argv.indexOf("--id");
  const replyId = process.argv[idFlagIndex + 1];
  const isMissingId = idFlagIndex < 0 || replyId === undefined;
  if (isMissingId)
    throw new Error("missing --id <replyId>");
  const replyState = await loadReplyState(replyId);
  const startMilliseconds = Date.now();
  const trace: TraceEntry[] = [];
  const extractedItems = await extractCandidates(replyState, trace);
  const elapsedSeconds = (Date.now() - startMilliseconds) / 1000;
  const outPath = await writeStageResult("extract", replyId, { id: replyId, replyState, extractedItems, trace, elapsedSeconds });
  console.log(outPath);
}
