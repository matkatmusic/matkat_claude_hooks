// import { choice, noul, TypeSafeClient, type ChoiceResponse, type NoulResponse, type Questions } from '@typesafe-ai/sdk';
import { choice, TypeSafeClient, type ChoiceResponse, type Questions } from '@typesafe-ai/sdk';
// import { loadReplyState, type LabeledReply, type ReplyState } from './checker5Calls';
import { loadReplyState, type LabeledReply } from './checker5Calls';
import { exit } from 'process';
// import { randomUUID } from 'node:crypto';

// const NOUL_YES_THRESHOLD = 0.7;
// const NOUL_NO_THRESHOLD = 0.3;
// const CHOICE_CONFIDENCE_THRESHOLD = 0.5;
// const FOLLOW_UP_PARENT_THRESHOLD = 0.5;
// const YES_CONFIDENCE_THRESHOLD = 0.5;
const MIN_YES_PROBABILITY = 0.6;
const FOLLOW_UP_ID_MARKER = '.followUp';
const YES_SCORE_LIMIT = 1;
// const CONTEXT_NOTE = '`message` is the message. `userPrompt` is the user\'s request before it, for context only.';

type CustomQuestion = { ask: string; choices?: Record<string, string>; 'follow-ups'?: string[] };
// type FollowUpRecord = { ask: string; gate: string; confidence: number };
type FollowUpState = Record<string, string | { ask: string; score: number; scoreLimit: number }>;
// type AnswerRecord = { gate: string; noul?: number; choice?: string; confidence?: number; probabilities?: Record<string, number>; followUps?: FollowUpRecord[] };
// type AskRequest = { state: FollowUpState; questions: Questions };

// function buildQuestions(customQuestions: Record<string, CustomQuestion>) {
//   const questions: Questions = {};
//   for (const questionId of Object.keys(customQuestions)) {
//     const customQuestion = customQuestions[questionId] as CustomQuestion;
//     const instructions = `${customQuestion.ask} ${CONTEXT_NOTE}`;
//     const hasChoices = customQuestion.choices !== undefined;
//     if (hasChoices)
//       questions[questionId] = choice(instructions, customQuestion.choices as Record<string, string>);
//     else
//       questions[questionId] = choice(instructions, {
//         yes: 'yes',
//         no: 'no',
//         unclear: 'not sure',
//       });
//   }
//   return questions;
// }

// function buildFollowUpQuestions(followUpsByParent: Record<string, string[]>) {
//   const questions: Questions = {};
//   for (const parentId of Object.keys(followUpsByParent)) {
//     const followUps = followUpsByParent[parentId] as string[];
//     for (let index = 0; index < followUps.length; index++) {
//       const instructions = `This follows the \`${parentId}.question\` which scored \`${parentId}.score\`.  ${followUps[index]}`;
//       questions[`${parentId}${FOLLOW_UP_ID_MARKER}${index}`] = noul(instructions);
//     }
//   }
//   return questions;
// }

function computeTimestamp() {
  const isoTime = new Date().toISOString();
  return isoTime.slice(0, 19).replaceAll(':', '-');
}

// function computeNoulRecord(response: NoulResponse) {
//   const record: AnswerRecord = { gate: 'unsure', noul: response.noul };
//   const isYes = response.noul >= NOUL_YES_THRESHOLD;
//   const isNo = response.noul <= NOUL_NO_THRESHOLD;
//   if (isYes)
//     record.gate = 'yes';
//   if (isNo)
//     record.gate = 'no';
//   return record;
// }
//
// function computeChoiceRecord(response: ChoiceResponse) {
//   const record: AnswerRecord = { gate: 'unsure', choice: response.choice, confidence: response.confidence, probabilities: { ...response.probabilities } };
//   const isConfident = response.confidence >= CHOICE_CONFIDENCE_THRESHOLD;
//   if (isConfident)
//     record.gate = response.choice;
//   return record;
// }
//
// function printAnswerLine(questionId: string, record: AnswerRecord) {
//   let value = '';
//   if (record.noul !== undefined)
//     value = record.noul.toFixed(2);
//   if (record.confidence !== undefined) {
//     const parts = [record.confidence.toFixed(2)];
//     const probabilities = record.probabilities as Record<string, number>;
//     for (const label of Object.keys(probabilities))
//       parts.push(`${label}=${(probabilities[label] as number).toFixed(2)}`);
//     value = parts.join('  ');
//   }
//   console.log(`${questionId}  ${record.gate}  ${value}`);
//   const followUps = record.followUps ?? [];
//   for (const followUp of followUps)
//     console.log(`  ↳ ${followUp.ask}  ${followUp.gate}  ${followUp.confidence.toFixed(2)}`);
// }
//
// // eslint-disable-next-line no-restricted-syntax
// async function askMainQuestions(replyState: ReplyState, customQuestions: Record<string, CustomQuestion>, client: TypeSafeClient | null, isDryRun: boolean) {
//   const request: AskRequest = {
//     state: {
//       message: replyState.reply.text,
//       userPrompt: replyState.userPrompt,
//     },
//     questions: buildQuestions(customQuestions),
//   };
//   if (isDryRun)
//     return { request, answers: null, seconds: 0 };
//   const startMs = Date.now();
//   const response = await (client as TypeSafeClient).systemOne(request);
//   const seconds = (Date.now() - startMs) / 1000;
//   const answers: Record<string, AnswerRecord> = {};
//   for (const questionId of Object.keys(customQuestions)) {
//     const answer = (response.answers as Record<string, NoulResponse | ChoiceResponse | undefined>)[questionId];
//     if (!answer)
//       throw new Error(`Missing TypeSafe answer: ${questionId}`);
//     let record: AnswerRecord;
//     if (answer.type === 'choice')
//       record = computeChoiceRecord(answer);
//     else
//       record = computeNoulRecord(answer);
//     answers[questionId] = record;
//   }
//   return { request, answers, seconds };
// }


// // Build a shape like this for each:
// function buildState(the_reply_being_judged: string, the_score_for_this_question: number, the_maximum_possible_score: number, questionIdentifier: any) {
//   const state =
//   {
//     "state":
//     {
//       "message": the_reply_being_judged,
//       questionIdentifier: //"workWaitsOnOtherWork"
//       {
//         "ask": questionIdentifier.ask, //"Does this message say that work waits until other work is completed?"
//         "score": the_score_for_this_question,
//         "scoreLimit": the_maximum_possible_score
//       }
//     }
//   };
//   const instructions =
//   {
//     "instructions":
//     {
//       "questions":
//       {
//         questionIdentifier: // "workWaitsOnOtherWork"
//         {
//           "type": "choice",
//           "instructions": createFollowUpQuestion("${questionIdentifier}.ask", "${questionIdentifier}.score", "${questionIdentifier}.scoreLimit", questionIdentifier.followUps[0]), //this expression should produce 'Following up on the question '`Does this message say that work waits until other work is completed?`', which scored `0.8`, (with a maximum possible of `1`): Does this message say what that other work is?'
//           "criteria":
//           {
//             "yes": "yes",
//             "no": "no",
//             "unclear": "not sure"
//           }
//         }
//       }
//     }
//   };
//
//   return { state, instructions };
// }

function createFollowUpQuestion(mainIdentifier: string, scoreIdentifier: string, scoreLimitIdentifier: string, followUp: string) : string {
  return "Following up on the question '`" + mainIdentifier + "`', which scored `" + scoreIdentifier + "`, (with a maximum possible of `" + scoreLimitIdentifier + "`): " + followUp;
}

// type MainQuestionResult = {
//   mainQuestion: string;
//   mainScore: number;
//   mainScoreLimit: number
// };
//
// function createFollowUpQuestionState(question: string, score: number, limit: number) : MainQuestionResult {
//   return {
//     mainQuestion: question,
//     mainScore:score,
//     mainScoreLimit: limit
//   };
// }

// // eslint-disable-next-line no-restricted-syntax
// async function askFollowupQuestions(replyState: ReplyState, mainAnswers: Record<string, AnswerRecord>, customQuestions: Record<string, CustomQuestion>, client: TypeSafeClient | null, isDryRun: boolean) {
//   const request: AskRequest = {
//     state: {
//       message: replyState.reply.text,
//     },
//     questions: {},
//   };
//   const followUpsByParent: Record<string, string[]> = {};
//   for (const parentId of Object.keys(customQuestions)) {
//     const customQuestion = customQuestions[parentId] as CustomQuestion;
//     const followUps = customQuestion['follow-ups'] ?? [];
//     const parentProbabilities = (mainAnswers[parentId] as AnswerRecord).probabilities as Record<string, number>;
//     const parentYesScore = parentProbabilities.yes as number;
//     const isParentYes = parentYesScore > FOLLOW_UP_PARENT_THRESHOLD;
//     const hasFollowUps = followUps.length > 0;
//     const isFollowUpParent = isParentYes && hasFollowUps;
//     if (!isFollowUpParent)
//       continue;
//     request.state[parentId] = {
//       ask: customQuestion.ask,
//       score: parentYesScore,
//       scoreLimit: YES_SCORE_LIMIT,
//     };
//     for (let index = 0; index < followUps.length; index++) {
//       request.questions[`${parentId}${FOLLOW_UP_ID_MARKER}${index}`] = {
//         type: 'choice',
//         instructions: createFollowUpQuestion(`${parentId}.ask`, `${parentId}.score`, `${parentId}.scoreLimit`, followUps[index] as string),
//         criteria: {
//           yes: 'yes',
//           no: 'no',
//           unclear: 'not sure',
//         },
//       };
//     }
//     followUpsByParent[parentId] = followUps;
//   }
//   const hasFollowUpParents = Object.keys(followUpsByParent).length > 0;
//   if (!hasFollowUpParents)
//     return { request: null, answers: null, seconds: 0 };
//   // const request: AskRequest = { state, questions };
//   if (isDryRun)
//     return { request, answers: null, seconds: 0 };
//   const startMs = Date.now();
//   const response = await (client as TypeSafeClient).systemOne(request);
//   const seconds = (Date.now() - startMs) / 1000;
//   const answers: Record<string, FollowUpRecord[]> = {};
//   for (const parentId of Object.keys(followUpsByParent)) {
//     const followUps = followUpsByParent[parentId] as string[];
//     answers[parentId] = [];
//     for (let index = 0; index < followUps.length; index++) {
//       const followUpId = `${parentId}${FOLLOW_UP_ID_MARKER}${index}`;
//       const followUpAnswer = (response.answers as Record<string, ChoiceResponse | undefined>)[followUpId];
//       if (!followUpAnswer)
//         throw new Error(`Missing TypeSafe answer: ${followUpId}`);
//       const followUpRecord = computeChoiceRecord(followUpAnswer);
//       (answers[parentId] as FollowUpRecord[]).push({ ask: followUps[index] as string, gate: followUpRecord.gate, confidence: followUpAnswer.confidence });
//     }
//   }
//   return { request, answers, seconds };
// }

// bun claude/claude_hooks/ask-dont-dump/mod/tests/askCustomQuestions.ts [--id <replyId>] [--dry-run [--main-from <custom-*.json>]]
if (import.meta.main) {
  // const idFlagIndex = process.argv.indexOf('--id');
  // const hasIdFlag = idFlagIndex >= 0;
  // const requestedReplyId = hasIdFlag ? process.argv[idFlagIndex + 1] : '';
  // const isMissingIdValue = hasIdFlag && requestedReplyId === undefined;
  // if (isMissingIdValue)
  //   throw new Error('missing --id <replyId>');
  const customFile: { questions: Record<string, CustomQuestion> } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const categoryLabels: { replies: LabeledReply[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  // const replyIds: string[] = [];
  // let isRequestedReplyFound = false;
  // for (const reply of categoryLabels.replies) {
  //   const isRequestedReply = reply.id === requestedReplyId;
  //   if (isRequestedReply)
  //     isRequestedReplyFound = true;
  //   const isSkipped = hasIdFlag && !isRequestedReply;
  //   if (isSkipped)
  //     continue;
  //   replyIds.push(reply.id);
  // }
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
  const savedAnswersByReply: Record<string, Record<string, ChoiceResponse>> = {};
  if (mainFromPath !== undefined) {
    // const savedResponses: Record<string, { answers: Record<string, ChoiceResponse> }> = await Bun.file(mainFromPath).json();
    // for (const [replyId, savedResponse] of Object.entries(savedResponses))
    //   savedAnswersByReply[replyId] = savedResponse.answers;
    const savedResults: Record<string, { main: { answers: Record<string, ChoiceResponse> } }> = await Bun.file(mainFromPath).json();
    for (const [replyId, savedResult] of Object.entries(savedResults))
      savedAnswersByReply[replyId] = savedResult.main.answers;
  }
  const client = new TypeSafeClient();
  // const responsesByReply: Record<string, unknown> = {};
  // const followUpResponsesByReply: Record<string, unknown> = {};
  const resultsByReply: Record<string, { main: unknown; followUp?: unknown }> = {};
  for (const reply of categoryLabels.replies) {
    const replyState = await loadReplyState(reply.id);
    const state = {
      // uid: randomUUID(),
      message: replyState.reply.text,
    };
    const questions: Questions = {};
    for (const [questionId, customQuestion] of Object.entries(customFile.questions))
      questions[questionId] = choice(customQuestion.ask, {
        yes: 'yes',
        no: 'no',
        unclear: 'not sure',
      });
    if (isDryRun)
      console.log({ state, questions });
    const isDryRunWithoutSavedAnswers = isDryRun && mainFromPath === undefined;
    if (isDryRunWithoutSavedAnswers)
      continue;
    let answers = savedAnswersByReply[reply.id] as Record<string, ChoiceResponse>;
    if (!isDryRun) {
      const response = await client.systemOne({ state, questions });
      // responsesByReply[reply.id] = response;
      resultsByReply[reply.id] = { main: response };
      answers = response.answers as Record<string, ChoiceResponse>;
    }
    let followUpState: FollowUpState = {};
    const followupQuestions: Questions = {};
    followUpState.message = replyState.reply.text;
    // const answers = response.answers as Record<string, ChoiceResponse>;
    for (const [questionId, customQuestion] of Object.entries(customFile.questions)) {
      const followUps = customQuestion['follow-ups'] ?? [];
      const hasFollowUps = followUps.length > 0;
      if (!hasFollowUps)
        continue;
      // const yesScore = (answers[questionId] as ChoiceResponse).probabilities.yes as number;
      // const isHighEnough = yesScore > FOLLOW_UP_PARENT_THRESHOLD;
      const parentAnswer = answers[questionId] as ChoiceResponse;
      const yesScore = parentAnswer.probabilities.yes as number;
      // const isYes = parentAnswer.choice === 'yes';
      // const isConfident = parentAnswer.confidence >= YES_CONFIDENCE_THRESHOLD;
      // const isHighEnough = isYes && isConfident;
      const isHighEnough = yesScore >= MIN_YES_PROBABILITY;
      // const isFollowUpParent = isHighEnough && hasFollowUps;
      if (!isHighEnough)
        continue;
      followUpState[questionId] = {
        ask: customQuestion.ask,
        score: yesScore,
        scoreLimit: YES_SCORE_LIMIT,
      };
      for (let index = 0; index < followUps.length; index++)
        followupQuestions[`${questionId}${FOLLOW_UP_ID_MARKER}${index}`] = choice(createFollowUpQuestion(`${questionId}.ask`, `${questionId}.score`, `${questionId}.scoreLimit`, followUps[index] as string), {
          yes: 'yes',
          no: 'no',
          unclear: 'not sure',
        });
    }
    const hasFollowupQuestions = Object.keys(followupQuestions).length > 0;
    if (!hasFollowupQuestions)
      continue;
    if (isDryRun) {
      console.log({ state: followUpState, questions: followupQuestions });
      continue;
    }
    const followUpResponse = await client.systemOne({ state: followUpState, questions: followupQuestions });
    // followUpResponsesByReply[reply.id] = followUpResponse;
    (resultsByReply[reply.id] as { main: unknown; followUp?: unknown }).followUp = followUpResponse;
  }
  // const responsesPath = `${import.meta.dir}/results/responses-${computeTimestamp()}.json`;
  // await Bun.write(responsesPath, JSON.stringify(responsesByReply, null, 2));
  // console.log(responsesPath);
  // const followUpResponsesPath = `${import.meta.dir}/results/followup-responses-${computeTimestamp()}.json`;
  // await Bun.write(followUpResponsesPath, JSON.stringify(followUpResponsesByReply, null, 2));
  // console.log(followUpResponsesPath);
  const resultsPath = `${import.meta.dir}/results/responses-${computeTimestamp()}.json`;
  await Bun.write(resultsPath, JSON.stringify(resultsByReply, null, 2));
  console.log(resultsPath);
  exit(0);


  // const isMissingRequestedReply = hasIdFlag && !isRequestedReplyFound;
  // if (isMissingRequestedReply)
  //   throw new Error(`no reply has id: ${requestedReplyId}`);

  // const isDryRun = process.argv.includes('--dry-run');
  // const mainFromFlagIndex = process.argv.indexOf('--main-from');
  // const hasMainFromFlag = mainFromFlagIndex >= 0;
  // const mainFromPath = hasMainFromFlag ? process.argv[mainFromFlagIndex + 1] : undefined;
  // const isMissingMainFromValue = hasMainFromFlag && mainFromPath === undefined;
  // if (isMissingMainFromValue)
  //   throw new Error('missing --main-from <path>');
  // const isMainFromWithoutDryRun = hasMainFromFlag && !isDryRun;
  // if (isMainFromWithoutDryRun)
  //   throw new Error('--main-from needs --dry-run');

  // if (isDryRun) {
  //   // const savedAnswersByReply: Record<string, Record<string, AnswerRecord>> = {};
  //   // if (mainFromPath !== undefined) {
  //   //   const savedFile: { replies: { id: string; answers: Record<string, AnswerRecord> }[] } = await Bun.file(mainFromPath).json();
  //   //   for (const savedReply of savedFile.replies)
  //   //     savedAnswersByReply[savedReply.id] = savedReply.answers;
  //   // }
  //   const dryRunReplies: object[] = [];
  //   for (const replyId of replyIds) {
  //     const replyState = await loadReplyState(replyId);
  //     if (mainFromPath === undefined) {
  //       const main = await askMainQuestions(replyState, customFile.questions, null, true);
  //       dryRunReplies.push({ id: replyId, mainRequest: main.request });
  //       continue;
  //     }
  //     // const mainAnswers = savedAnswersByReply[replyId];
  //     // if (mainAnswers === undefined)
  //     //   throw new Error(`${mainFromPath} has no entry for reply: ${replyId}`);
  //     // const followUp = await askFollowupQuestions(replyState, mainAnswers, customFile.questions, null, true);
  //     // dryRunReplies.push({ id: replyId, mainAnswersFrom: mainFromPath, mainAnswers, followUpRequest: followUp.request });
  //   }
  //   const dryRunPath = `${import.meta.dir}/results/dry-run-${computeTimestamp()}.json`;
  //   await Bun.write(dryRunPath, JSON.stringify({ replies: dryRunReplies }, null, 2));
  //   console.log(dryRunPath);
  //   process.exit(0);
  // }
  //
  // // const client = new TypeSafeClient();
  // const replyResults: { id: string; elapsedSeconds: number; followUpRequestSeconds: number; answers: Record<string, AnswerRecord> }[] = [];
  // for (const replyId of replyIds) {
  //   const replyState = await loadReplyState(replyId);
  //   const main = await askMainQuestions(replyState, customFile.questions, client, false);
  //   const answers = main.answers as Record<string, AnswerRecord>;
  //   const followUp = await askFollowupQuestions(replyState, answers, customFile.questions, client, false);
  //   if (followUp.answers !== null) {
  //     for (const parentId of Object.keys(followUp.answers))
  //       (answers[parentId] as AnswerRecord).followUps = followUp.answers[parentId];
  //   }
  //   const followUpRequestSeconds = followUp.seconds;
  //   const elapsedSeconds = main.seconds + followUp.seconds;
  //   console.log(`=== ${replyId} (${elapsedSeconds.toFixed(1)}s)`);
  //   for (const questionId of Object.keys(answers))
  //     printAnswerLine(questionId, answers[questionId] as AnswerRecord);
  //   replyResults.push({ id: replyId, elapsedSeconds, followUpRequestSeconds, answers });
  // }
  //
  // const outPath = `${import.meta.dir}/results/custom-${computeTimestamp()}.json`;
  // const thresholds = { noulYes: NOUL_YES_THRESHOLD, noulNo: NOUL_NO_THRESHOLD, choiceConfidence: CHOICE_CONFIDENCE_THRESHOLD, followUpParent: FOLLOW_UP_PARENT_THRESHOLD };
  // await Bun.write(outPath, JSON.stringify({ thresholds, questions: customFile.questions, replies: replyResults }, null, 2));
  // console.log(outPath);
}
