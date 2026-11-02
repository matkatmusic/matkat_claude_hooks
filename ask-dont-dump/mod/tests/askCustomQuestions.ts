// import { choice, TypeSafeClient, type ChoiceResponse, type Questions } from '@typesafe-ai/sdk';
// import { loadReplyState, type LabeledReply } from './checker5Calls';
// import { exit } from 'process';

// const MIN_YES_PROBABILITY = 0.6;
// const FOLLOW_UP_ID_MARKER = '.followUp';
// const YES_SCORE_LIMIT = 1;

// type CustomQuestion = { active: boolean; ask: string; followUps?: { active: boolean; ask: string }[] };
// type QuestionGroup = { active: boolean; [questionId: string]: CustomQuestion | boolean };
// type FollowUpState = Record<string, string | { ask: string; score: number; scoreLimit: number }>;



// function computeTimestamp() {
//   const isoTime = new Date().toISOString();
//   return isoTime.slice(0, 19).replaceAll(':', '-');
// }

// // // eslint-disable-next-line no-restricted-syntax


// // // Build a shape like this for each:

// function createFollowUpQuestion(mainIdentifier: string, scoreIdentifier: string, scoreLimitIdentifier: string, followUp: string) : string {
//   return "Following up on the question '`" + mainIdentifier + "`', which scored `" + scoreIdentifier + "`, (with a maximum possible of `" + scoreLimitIdentifier + "`): " + followUp;
// }

// // // eslint-disable-next-line no-restricted-syntax

// // bun claude/claude_hooks/ask-dont-dump/mod/tests/askCustomQuestions.ts [--id <replyId>] [--reply <replyId>] [--question <questionId> ...] [--dry-run [--main-from <custom-*.json>]]
// if (import.meta.main) {
//   // const customFile: { questions: Record<string, CustomQuestion> } =
//   const customFile: { questions: { groups: Record<string, QuestionGroup> } } =
//     await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
//   const categoryLabels: { replies: LabeledReply[] } =
//     await Bun.file(`${import.meta.dir}/category-labels.json`).json();
//   const isDryRun = process.argv.includes('--dry-run');
//   const mainFromFlagIndex = process.argv.indexOf('--main-from');
//   const hasMainFromFlag = mainFromFlagIndex >= 0;
//   const mainFromPath = hasMainFromFlag ? process.argv[mainFromFlagIndex + 1] : undefined;
//   const isMissingMainFromValue = hasMainFromFlag && mainFromPath === undefined;
//   if (isMissingMainFromValue)
//     throw new Error('missing --main-from <path>');
//   const isMainFromWithoutDryRun = hasMainFromFlag && !isDryRun;
//   if (isMainFromWithoutDryRun)
//     throw new Error('--main-from needs --dry-run');
//   const replyFlagIndex = process.argv.indexOf('--reply');
//   const hasReplyFlag = replyFlagIndex >= 0;
//   const requestedReplyIdFromFlag = hasReplyFlag ? process.argv[replyFlagIndex + 1] : undefined;
//   const isMissingReplyValue = hasReplyFlag && (requestedReplyIdFromFlag === undefined || requestedReplyIdFromFlag.startsWith('--'));
//   if (isMissingReplyValue)
//     throw new Error('missing --reply <replyId>');
//   let isReplyFound = false;
//   for (const reply of categoryLabels.replies) {
//     const isRequestedReply = reply.id === requestedReplyIdFromFlag;
//     if (isRequestedReply)
//       isReplyFound = true;
//   }
//   const isUnknownReply = hasReplyFlag && !isReplyFound;
//   if (isUnknownReply)
//     throw new Error(`no reply has id: ${requestedReplyIdFromFlag}`);
//   const requestedQuestionIds: string[] = [];
//   for (let argIndex = 0; argIndex < process.argv.length; argIndex++) {
//     const isQuestionFlag = process.argv[argIndex] === '--question';
//     if (!isQuestionFlag)
//       continue;
//     const questionValue = process.argv[argIndex + 1];
//     const isMissingQuestionValue = questionValue === undefined || questionValue.startsWith('--');
//     if (isMissingQuestionValue)
//       throw new Error('missing --question <questionId>');
//     requestedQuestionIds.push(questionValue);
//   }
//   const hasQuestionFilter = requestedQuestionIds.length > 0;
//   const knownQuestionIds: string[] = [];
//   for (const group of Object.values(customFile.questions.groups)) {
//     for (const groupKey of Object.keys(group)) {
//       const isGroupFlag = groupKey === 'active';
//       if (isGroupFlag)
//         continue;
//       knownQuestionIds.push(groupKey);
//     }
//   }
//   for (const requestedQuestionId of requestedQuestionIds) {
//     const isUnknownQuestion = !knownQuestionIds.includes(requestedQuestionId);
//     if (isUnknownQuestion)
//       throw new Error(`no question has id: ${requestedQuestionId}`);
//   }
//   const savedAnswersByReply: Record<string, Record<string, ChoiceResponse>> = {};
//   if (mainFromPath !== undefined) {
//     //   savedAnswersByReply[replyId] = savedResponse.answers;
//     const savedResults: Record<string, { main: { answers: Record<string, ChoiceResponse> } }> = await Bun.file(mainFromPath).json();
//     for (const [replyId, savedResult] of Object.entries(savedResults))
//       savedAnswersByReply[replyId] = savedResult.main.answers;
//   }
//   const client = new TypeSafeClient();
//   const resultsByReply: Record<string, { main: unknown; followUp?: unknown }> = {};
//   for (const reply of categoryLabels.replies) {
//     const isReplySkipped = hasReplyFlag && reply.id !== requestedReplyIdFromFlag;
//     if (isReplySkipped)
//       continue;
//     const replyState = await loadReplyState(reply.id);
//     const state = {
//       message: replyState.reply.text,
//     };
//     const questions: Questions = {};
//     for (const group of Object.values(customFile.questions.groups)) {
//       const isGroupInactive = !group.active && !hasQuestionFilter;
//       if (isGroupInactive)
//         continue;
//       for (const [questionId, groupEntry] of Object.entries(group)) {
//         const isGroupFlag = questionId === 'active';
//         if (isGroupFlag)
//           continue;
//         const customQuestion = groupEntry as CustomQuestion;
//         const isQuestionNotNamed = hasQuestionFilter && !requestedQuestionIds.includes(questionId);
//         if (isQuestionNotNamed)
//           continue;
//         const isQuestionInactive = !customQuestion.active && !hasQuestionFilter;
//         if (isQuestionInactive)
//           continue;
//         questions[questionId] = choice(customQuestion.ask, {
//           yes: 'yes',
//           no: 'no',
//           unclear: 'not sure',
//         });
//       }
//     }
//     if (isDryRun)
//       console.log(JSON.stringify({ state, questions }, null, 2));
//     const isDryRunWithoutSavedAnswers = isDryRun && mainFromPath === undefined;
//     if (isDryRunWithoutSavedAnswers)
//       continue;
//     let answers = savedAnswersByReply[reply.id] as Record<string, ChoiceResponse>;
//     if (!isDryRun) {
//       const response = await client.systemOne({ state, questions });
//       // responsesByReply[reply.id] = response;
//       resultsByReply[reply.id] = { main: response };
//       answers = response.answers as Record<string, ChoiceResponse>;
//     }
//     let followUpState: FollowUpState = {};
//     const followupQuestions: Questions = {};
//     followUpState.message = replyState.reply.text;
//     for (const group of Object.values(customFile.questions.groups)) {
//       const isGroupInactive = !group.active && !hasQuestionFilter;
//       if (isGroupInactive)
//         continue;
//       for (const [questionId, groupEntry] of Object.entries(group)) {
//         const isGroupFlag = questionId === 'active';
//         if (isGroupFlag)
//           continue;
//         const customQuestion = groupEntry as CustomQuestion;
//         const isQuestionNotNamed = hasQuestionFilter && !requestedQuestionIds.includes(questionId);
//         if (isQuestionNotNamed)
//           continue;
//         const isQuestionInactive = !customQuestion.active && !hasQuestionFilter;
//         if (isQuestionInactive)
//           continue;
//         const followUps = customQuestion.followUps ?? [];
//         let activeFollowUpCount = 0;
//         for (const followUp of followUps) {
//           const isFollowUpActive = followUp.active;
//           if (isFollowUpActive)
//             activeFollowUpCount++;
//         }
//         const hasFollowUps = activeFollowUpCount > 0;
//         if (!hasFollowUps)
//           continue;
//         const parentAnswer = answers[questionId] as ChoiceResponse;
//         const yesScore = parentAnswer.probabilities.yes as number;
//         const isHighEnough = yesScore >= MIN_YES_PROBABILITY;
//         if (!isHighEnough)
//           continue;
//         followUpState[questionId] = {
//           ask: customQuestion.ask,
//           score: yesScore,
//           scoreLimit: YES_SCORE_LIMIT,
//         };
//         for (let index = 0; index < followUps.length; index++) {
//           const followUp = followUps[index] as { ask: string; active: boolean };
//           const isFollowUpInactive = !followUp.active;
//           if (isFollowUpInactive)
//             continue;
//           followupQuestions[`${questionId}${FOLLOW_UP_ID_MARKER}${index}`] = choice(createFollowUpQuestion(`${questionId}.ask`, `${questionId}.score`, `${questionId}.scoreLimit`, followUp.ask), {
//             yes: 'yes',
//             no: 'no',
//             unclear: 'not sure',
//           });
//         }
//       }
//     }
//     const hasFollowupQuestions = Object.keys(followupQuestions).length > 0;
//     if (!hasFollowupQuestions)
//       continue;
//     if (isDryRun) {
//       console.log(JSON.stringify({ state: followUpState, questions: followupQuestions }, null, 2));
//       continue;
//     }
//     const followUpResponse = await client.systemOne({ state: followUpState, questions: followupQuestions });
//     // followUpResponsesByReply[reply.id] = followUpResponse;
//     (resultsByReply[reply.id] as { main: unknown; followUp?: unknown }).followUp = followUpResponse;
//   }
//   if (!isDryRun) {
//     const resultsPath = `${import.meta.dir}/results/responses-${computeTimestamp()}.json`;
//     await Bun.write(resultsPath, JSON.stringify(resultsByReply, null, 2));
//     console.log(resultsPath);
//   }
//   exit(0);
// }
