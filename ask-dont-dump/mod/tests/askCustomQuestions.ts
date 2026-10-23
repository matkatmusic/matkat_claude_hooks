import { choice, noul, TypeSafeClient, type ChoiceResponse, type NoulResponse, type Questions } from '@typesafe-ai/sdk';
import { loadReplyState, type LabeledReply, type ReplyState } from './checker5Calls';

const NOUL_YES_THRESHOLD = 0.7;
const NOUL_NO_THRESHOLD = 0.3;
const CHOICE_CONFIDENCE_THRESHOLD = 0.5;
const FOLLOW_UP_PARENT_THRESHOLD = 0.5;
const FOLLOW_UP_ID_MARKER = '.followUp';
const CONTEXT_NOTE = '`message` is the message. `userPrompt` is the user\'s request before it, for context only.';

type CustomQuestion = { ask: string; choices?: Record<string, string>; 'follow-ups'?: string[] };
type FollowUpRecord = { ask: string; gate: string; noul: number };
type FollowUpState = Record<string, string | { question: string; score: number }>;
type AnswerRecord = { gate: string; noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number>; followUps?: FollowUpRecord[] };
type AskRequest = { state: FollowUpState; questions: Questions };

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

function buildFollowUpQuestions(followUpsByParent: Record<string, string[]>) {
  const questions: Questions = {};
  for (const parentId of Object.keys(followUpsByParent)) {
    const followUps = followUpsByParent[parentId] as string[];
    for (let index = 0; index < followUps.length; index++) {
      const instructions = `This follows the \`${parentId}.question\` which scored \`${parentId}.score\`.  ${followUps[index]}`;
      questions[`${parentId}${FOLLOW_UP_ID_MARKER}${index}`] = noul(instructions);
    }
  }
  return questions;
}

function computeTimestamp() {
  const isoTime = new Date().toISOString();
  return isoTime.slice(0, 19).replaceAll(':', '-');
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
  const followUps = record.followUps ?? [];
  for (const followUp of followUps)
    console.log(`  ↳ ${followUp.ask}  ${followUp.gate}  ${followUp.noul.toFixed(2)}`);
}

// eslint-disable-next-line no-restricted-syntax
async function askMainQuestions(replyState: ReplyState, customQuestions: Record<string, CustomQuestion>, client: TypeSafeClient | null, isDryRun: boolean) {
  const state = { message: replyState.reply.text, userPrompt: replyState.userPrompt };
  const request: AskRequest = { state, questions: buildQuestions(customQuestions) };
  if (isDryRun)
    return { request, answers: null, seconds: 0 };
  const startMs = Date.now();
  const response = await (client as TypeSafeClient).systemOne(request);
  const seconds = (Date.now() - startMs) / 1000;
  const answers: Record<string, AnswerRecord> = {};
  for (const questionId of Object.keys(customQuestions)) {
    const answer = (response.answers as Record<string, NoulResponse | ChoiceResponse | undefined>)[questionId];
    if (!answer)
      throw new Error(`Missing TypeSafe answer: ${questionId}`);
    let record: AnswerRecord;
    if (answer.type === 'choice')
      record = computeChoiceRecord(answer);
    else
      record = computeNoulRecord(answer);
    answers[questionId] = record;
  }
  return { request, answers, seconds };
}

// eslint-disable-next-line no-restricted-syntax
async function askFollowupQuestions(replyState: ReplyState, mainAnswers: Record<string, AnswerRecord>, customQuestions: Record<string, CustomQuestion>, client: TypeSafeClient | null, isDryRun: boolean) {
  const followUpState: FollowUpState = { message: replyState.reply.text, userPrompt: replyState.userPrompt };
  const followUpsByParent: Record<string, string[]> = {};
  for (const parentId of Object.keys(customQuestions)) {
    const customQuestion = customQuestions[parentId] as CustomQuestion;
    const followUps = customQuestion['follow-ups'] ?? [];
    const parentNoul = (mainAnswers[parentId] as AnswerRecord).noul;
    const isParentYes = parentNoul !== undefined && parentNoul > FOLLOW_UP_PARENT_THRESHOLD;
    const hasFollowUps = followUps.length > 0;
    const isFollowUpParent = isParentYes && hasFollowUps;
    if (!isFollowUpParent)
      continue;
    followUpState[parentId] = { question: customQuestion.ask, score: parentNoul };
    followUpsByParent[parentId] = followUps;
  }
  const hasFollowUpParents = Object.keys(followUpsByParent).length > 0;
  if (!hasFollowUpParents)
    return { request: null, answers: null, seconds: 0 };
  const request: AskRequest = { state: followUpState, questions: buildFollowUpQuestions(followUpsByParent) };
  if (isDryRun)
    return { request, answers: null, seconds: 0 };
  const startMs = Date.now();
  const response = await (client as TypeSafeClient).systemOne(request);
  const seconds = (Date.now() - startMs) / 1000;
  const answers: Record<string, FollowUpRecord[]> = {};
  for (const parentId of Object.keys(followUpsByParent)) {
    const followUps = followUpsByParent[parentId] as string[];
    answers[parentId] = [];
    for (let index = 0; index < followUps.length; index++) {
      const followUpId = `${parentId}${FOLLOW_UP_ID_MARKER}${index}`;
      const followUpAnswer = (response.answers as Record<string, NoulResponse | undefined>)[followUpId];
      if (!followUpAnswer)
        throw new Error(`Missing TypeSafe answer: ${followUpId}`);
      const followUpRecord = computeNoulRecord(followUpAnswer);
      (answers[parentId] as FollowUpRecord[]).push({ ask: followUps[index] as string, gate: followUpRecord.gate, noul: followUpAnswer.noul });
    }
  }
  return { request, answers, seconds };
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/askCustomQuestions.ts [--id <replyId>] [--dry-run [--main-from <custom-*.json>]]
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

  const isDryRun = process.argv.includes('--dry-run');
  const mainFromFlagIndex = process.argv.indexOf('--main-from');
  const hasMainFromFlag = mainFromFlagIndex >= 0;
  const mainFromPath = hasMainFromFlag ? process.argv[mainFromFlagIndex + 1] : undefined;
  const isMissingMainFromValue = hasMainFromFlag && mainFromPath === undefined;
  if (isMissingMainFromValue)
    throw new Error('missing --main-from <path>');
  const isMainFromWithoutDryRun = hasMainFromFlag && !isDryRun;
  if (isMainFromWithoutDryRun)
    throw new Error('--main-from needs --dry-run');

  if (isDryRun) {
    const savedAnswersByReply: Record<string, Record<string, AnswerRecord>> = {};
    if (mainFromPath !== undefined) {
      const savedFile: { replies: { id: string; answers: Record<string, AnswerRecord> }[] } = await Bun.file(mainFromPath).json();
      for (const savedReply of savedFile.replies)
        savedAnswersByReply[savedReply.id] = savedReply.answers;
    }
    const dryRunReplies: object[] = [];
    for (const replyId of replyIds) {
      const replyState = await loadReplyState(replyId);
      if (mainFromPath === undefined) {
        const main = await askMainQuestions(replyState, customFile.questions, null, true);
        dryRunReplies.push({ id: replyId, mainRequest: main.request });
        continue;
      }
      const mainAnswers = savedAnswersByReply[replyId];
      if (mainAnswers === undefined)
        throw new Error(`${mainFromPath} has no entry for reply: ${replyId}`);
      const followUp = await askFollowupQuestions(replyState, mainAnswers, customFile.questions, null, true);
      dryRunReplies.push({ id: replyId, mainAnswersFrom: mainFromPath, mainAnswers, followUpRequest: followUp.request });
    }
    const dryRunPath = `${import.meta.dir}/results/dry-run-${computeTimestamp()}.json`;
    await Bun.write(dryRunPath, JSON.stringify({ replies: dryRunReplies }, null, 2));
    console.log(dryRunPath);
    process.exit(0);
  }

  const client = new TypeSafeClient();
  const replyResults: { id: string; elapsedSeconds: number; followUpRequestSeconds: number; answers: Record<string, AnswerRecord> }[] = [];
  for (const replyId of replyIds) {
    const replyState = await loadReplyState(replyId);
    const main = await askMainQuestions(replyState, customFile.questions, client, false);
    const answers = main.answers as Record<string, AnswerRecord>;
    const followUp = await askFollowupQuestions(replyState, answers, customFile.questions, client, false);
    if (followUp.answers !== null) {
      for (const parentId of Object.keys(followUp.answers))
        (answers[parentId] as AnswerRecord).followUps = followUp.answers[parentId];
    }
    const followUpRequestSeconds = followUp.seconds;
    const elapsedSeconds = main.seconds + followUp.seconds;
    console.log(`=== ${replyId} (${elapsedSeconds.toFixed(1)}s)`);
    for (const questionId of Object.keys(answers))
      printAnswerLine(questionId, answers[questionId] as AnswerRecord);
    replyResults.push({ id: replyId, elapsedSeconds, followUpRequestSeconds, answers });
  }

  const outPath = `${import.meta.dir}/results/custom-${computeTimestamp()}.json`;
  const thresholds = { noulYes: NOUL_YES_THRESHOLD, noulNo: NOUL_NO_THRESHOLD, choiceConfidence: CHOICE_CONFIDENCE_THRESHOLD, followUpParent: FOLLOW_UP_PARENT_THRESHOLD };
  await Bun.write(outPath, JSON.stringify({ thresholds, questions: customFile.questions, replies: replyResults }, null, 2));
  console.log(outPath);
}
