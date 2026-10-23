import { choice, noul, TypeSafeClient, type ChoiceResponse, type NoulResponse, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState, type LabeledReply } from './checker5Calls';

const NOUL_YES_THRESHOLD = 0.7;
const NOUL_NO_THRESHOLD = 0.3;
const CHOICE_CONFIDENCE_THRESHOLD = 0.5;
const CONTEXT_NOTE = '`reply` is the message. `userPrompt` is the user\'s request before it, for context only.';

type CustomQuestion = { ask: string; choices?: Record<string, string> };
type AnswerRecord = { gate: string; noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number> };

function buildQuestions(customQuestions: Record<string, CustomQuestion>) {
  const questions: Questions = {};
  for (const questionId of Object.keys(customQuestions)) {
    const customQuestion = customQuestions[questionId] as CustomQuestion;
    const instructions = `${customQuestion.ask} ${CONTEXT_NOTE}`;
    const hasChoices = customQuestion.choices !== undefined;
    if (hasChoices)
      questions[questionId] = choice(instructions, customQuestion.choices as Record<string, string>);
    else
      questions[questionId] = noul(instructions);
  }
  return questions;
}

function computeNoulRecord(response: NoulResponse) {
  const record: AnswerRecord = { gate: 'unsure', noul: response.noul };
  const isYes = response.noul >= NOUL_YES_THRESHOLD;
  const isNo = response.noul <= NOUL_NO_THRESHOLD;
  if (isYes)
    record.gate = 'yes';
  if (isNo)
    record.gate = 'no';
  return record;
}

function computeChoiceRecord(response: ChoiceResponse) {
  const record: AnswerRecord = { gate: 'unsure', choice: response.choice, confidence: response.confidence, probabilities: { ...response.probabilities } };
  const isConfident = response.confidence >= CHOICE_CONFIDENCE_THRESHOLD;
  if (isConfident)
    record.gate = response.choice;
  return record;
}

function printAnswerLine(questionId: string, record: AnswerRecord) {
  let value = '';
  if (record.noul !== undefined)
    value = record.noul.toFixed(2);
  if (record.confidence !== undefined) {
    const parts = [record.confidence.toFixed(2)];
    const probabilities = record.probabilities as Record<string, number>;
    for (const label of Object.keys(probabilities))
      parts.push(`${label}=${(probabilities[label] as number).toFixed(2)}`);
    value = parts.join('  ');
  }
  console.log(`${questionId}  ${record.gate}  ${value}`);
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/askCustomQuestions.ts [--id <replyId>]
if (import.meta.main) {
  const idFlagIndex = process.argv.indexOf('--id');
  const hasIdFlag = idFlagIndex >= 0;
  const requestedReplyId = hasIdFlag ? process.argv[idFlagIndex + 1] : '';
  const isMissingIdValue = hasIdFlag && requestedReplyId === undefined;
  if (isMissingIdValue)
    throw new Error('missing --id <replyId>');
  const customFile: { questions: Record<string, CustomQuestion> } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const categoryLabels: { replies: LabeledReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  const replyIds: string[] = [];
  let isRequestedReplyFound = false;
  for (const reply of categoryLabels.replies) {
    const isRequestedReply = reply.id === requestedReplyId;
    if (isRequestedReply)
      isRequestedReplyFound = true;
    const isSkipped = hasIdFlag && !isRequestedReply;
    if (isSkipped)
      continue;
    replyIds.push(reply.id);
  }
  const isMissingRequestedReply = hasIdFlag && !isRequestedReplyFound;
  if (isMissingRequestedReply)
    throw new Error(`no reply has id: ${requestedReplyId}`);

  const client = new TypeSafeClient();
  const questions = buildQuestions(customFile.questions);
  const replyResults: { id: string; elapsedSeconds: number; answers: Record<string, AnswerRecord> }[] = [];
  for (const replyId of replyIds) {
    const replyState = await loadReplyState(replyId);
    const startMs = Date.now();
    const response = await client.systemOne({
      state: { reply: replyState.reply.text, userPrompt: replyState.userPrompt },
      questions,
    });
    const elapsedSeconds = (Date.now() - startMs) / 1000;
    console.log(`=== ${replyId} (${elapsedSeconds.toFixed(1)}s)`);
    const answers: Record<string, AnswerRecord> = {};
    for (const questionId of Object.keys(customFile.questions)) {
      const answer = (response.answers as Record<string, NoulResponse | ChoiceResponse | undefined>)[questionId];
      if (!answer)
        throw new Error(`Missing TypeSafe answer: ${questionId}`);
      let record: AnswerRecord;
      if (answer.type === 'choice')
        record = computeChoiceRecord(answer);
      else
        record = computeNoulRecord(answer);
      answers[questionId] = record;
      printAnswerLine(questionId, record);
    }
    replyResults.push({ id: replyId, elapsedSeconds, answers });
  }

  const isoTime = new Date().toISOString();
  const timestamp = isoTime.slice(0, 19).replaceAll(':', '-');
  const outPath = `${import.meta.dir}/results/custom-${timestamp}.json`;
  const thresholds = { noulYes: NOUL_YES_THRESHOLD, noulNo: NOUL_NO_THRESHOLD, choiceConfidence: CHOICE_CONFIDENCE_THRESHOLD };
  await Bun.write(outPath, JSON.stringify({ thresholds, questions: customFile.questions, replies: replyResults }, null, 2));
  console.log(outPath);
}
