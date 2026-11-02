// import { readdirSync } from "node:fs";
// import { homedir } from "node:os";
// import { score, type Questions, type ScoreResponse, TypeSafeClient } from "@typesafe-ai/sdk";

// const client = new TypeSafeClient();

// const SCORE_THRESHOLD = 0.5;
// const isPrintingRequests = process.argv.includes("--dry-run");
// const isWritingScores = process.argv.includes("--withScores");


// type LabeledReply = { id: string; userPrompt: string; text: { category: string[]; text: string }[] };
// type ScoredReply = { id: string; reply: string[]; passed: Record<string, string[]>; outcomes: string[]; scores?: Record<string, Record<string, number>> };
// type TaskSummary = { id: string; subject: string; status: string };
// type ReplyState = { reply: { text: string }; userPrompt: string; taskList: TaskSummary[] };
// const categoryLabels: { replies: LabeledReply[] } =
//   await Bun.file(`${import.meta.dir}/category-labels.json`).json();

// const OUTCOME_DO_NOT_BLOCK = "do not block";
// const OUTCOME_BLOCK_ASK = "block: AskUserQuestion";
// const OUTCOME_BLOCK_TASK = "block: TaskCreate";

// const ABOUT_QUESTION = "What is the reply about?";
// const DOES_QUESTION = "What does the reply do?";
// const WHO_QUESTION = "Who must act next, and when?";
// const ASKED_QUESTION = "Did the user ask for this instruction?";
// const LISTED_QUESTION = "Is all the work Claude owes already on the task list?";

// const aboutChoices: Record<string, string> = {
//   work: "work or task",
//   check: "a check or test",
//   code: "the code",
//   decision: "a question or decision",
//   helper: "a helper",
//   taskList: "the task list",
//   plan: "the method or plan",
//   otherSession: "another session",
//   bug: "a bug or problem",
// };
// const doesChoices: Record<string, string> = {
//   fact: "states a fact",
//   question: "asks a question",
//   offer: "offers to do something or asks for approval",
//   choices: "gives choices with no pick",
//   decision: "records a decision the user made",
//   answer: "answers a question with a confirmed answer",
//   instruction: "tells the user to do something",
//   guess: "states a guess, a gap, or an unconfirmed answer",
// };
// const whoChoices: Record<string, string> = {
//   claudeNow: "Claude, starting work with several steps now",
//   claudeLater: "Claude, after this turn",
//   helper: "a helper, during this turn",
//   user: "the user, after this turn",
//   nobodyDone: "nobody: the work is done",
//   nobodyOpen: "nobody yet: the work is still open",
// };
// const askedChoices: Record<string, string> = {
//   yes: "yes, the user asked for it",
//   no: "no, the user did not ask for it",
// };
// const listedChoices: Record<string, string> = {
//   yes: "yes, all of it is on the task list",
//   no: "no, some of it is not on the task list",
// };

// const userPromptPath = { userPrompt: "`userPrompt`" };
// const userPromptAndTaskListPaths = { userPrompt: "`userPrompt`", taskList: "`taskList`" };

// export async function loadTaskList():Promise<TaskSummary[]> {
//   const settings = await Bun.file(`${process.cwd()}/.claude/settings.json`).json();
//   const taskListId = settings.env.CLAUDE_CODE_TASK_LIST_ID;
//   const taskDirectory = `${homedir()}/.claude/tasks/${taskListId}`;
//   const taskList: TaskSummary[] = [];
//   for (const fileName of readdirSync(taskDirectory)) {
//     const isTaskFile = fileName.endsWith(".json");
//     if (isTaskFile) {
//       const task = await Bun.file(`${taskDirectory}/${fileName}`).json();
//       taskList.push({ id: task.id, subject: task.subject, status: task.status });
//     }
//   }
//   return taskList;
// }

// // one request for one flowchart question: one yes/no score question per choice
// export function buildNodeRequest(state: ReplyState, nodeQuestion: string, choiceLabels: Record<string, string>, statePaths: Record<string, string>) {
//   const questions: Questions = {};
//   for (const [choiceName, choiceLabel] of Object.entries(choiceLabels)) {
//     const instructions = {
//       reply: "`reply.text`",
//       ...statePaths,
//       question: `\`reply\` is a message an AI assistant wrote to the user at the end of its turn. ${nodeQuestion} Is this answer right: ${choiceLabel}?`,
//     };
//     questions[choiceName] = score(instructions, ["no", "yes"]);
//   }
//   return { state, questions };
// }

// async function computeNodeValues(state: ReplyState, nodeQuestion: string, choiceLabels: Record<string, string>, statePaths: Record<string, string>) {
//   const response = await client.systemOne(buildNodeRequest(state, nodeQuestion, choiceLabels, statePaths));
//   const values: Record<string, number> = {};
//   for (const [choiceName, answer] of Object.entries(response.answers))
//     values[choiceName] = (answer as ScoreResponse).score;
//   return values;
// }

// async function computeReplyOutcomes(state: ReplyState) {
//   const outcomes = new Set<string>();
//   const passed: Record<string, string[]> = {};
//   const scores: Record<string, Record<string, number>> = {};
//   let isWhoReached = false;
//   let isAskedReached = false;
//   let isListedReached = false;

//   const aboutValues = await computeNodeValues(state, ABOUT_QUESTION, aboutChoices, userPromptPath);
//   scores.about = aboutValues;
//   const aboutPassed: string[] = [];
//   for (const [choiceName, value] of Object.entries(aboutValues)) {
//     const isPassing = value > SCORE_THRESHOLD;
//     if (isPassing) {
//       aboutPassed.push(choiceName);
//     }
//   }
//   const isAboutPassing = aboutPassed.length > 0;
//   if (!isAboutPassing) {
//     outcomes.add(OUTCOME_DO_NOT_BLOCK);
//     return { passed, outcomes: [...outcomes], scores };
//   }
//   passed.about = aboutPassed;

//   const doesValues = await computeNodeValues(state, DOES_QUESTION, doesChoices, userPromptPath);
//   scores.does = doesValues;
//   const doesPassed: string[] = [];
//   for (const [choiceName, value] of Object.entries(doesValues)) {
//     const isPassing = value > SCORE_THRESHOLD;
//     if (isPassing) {
//       doesPassed.push(choiceName);
//       switch (choiceName) {
//         case "question":
//         case "offer":
//         case "choices":
//         case "guess":
//           outcomes.add(OUTCOME_BLOCK_ASK);
//           break;
//         case "decision":
//         case "answer":
//           outcomes.add(OUTCOME_DO_NOT_BLOCK);
//           break;
//         case "instruction":
//           isAskedReached = true;
//           break;
//         case "fact":
//           isWhoReached = true;
//           break;
//       }
//     }
//   }
//   const isDoesEmpty = doesPassed.length === 0;
//   if (isDoesEmpty)
//     outcomes.add(OUTCOME_DO_NOT_BLOCK);
//   else
//     passed.does = doesPassed;

//   if (isWhoReached) {
//     const whoValues = await computeNodeValues(state, WHO_QUESTION, whoChoices, userPromptPath);
//     scores.who = whoValues;
//     const whoPassed: string[] = [];
//     for (const [choiceName, value] of Object.entries(whoValues)) {
//       const isPassing = value > SCORE_THRESHOLD;
//       if (isPassing) {
//         whoPassed.push(choiceName);
//         switch (choiceName) {
//           case "claudeNow":
//           case "claudeLater":
//           case "nobodyOpen":
//             isListedReached = true;
//             break;
//           case "helper":
//           case "nobodyDone":
//             outcomes.add(OUTCOME_DO_NOT_BLOCK);
//             break;
//           case "user":
//             isAskedReached = true;
//             break;
//         }
//       }
//     }
//     const isWhoEmpty = whoPassed.length === 0;
//     if (isWhoEmpty)
//       outcomes.add(OUTCOME_DO_NOT_BLOCK);
//     else
//       passed.who = whoPassed;
//   }

//   if (isAskedReached) {
//     const askedValues = await computeNodeValues(state, ASKED_QUESTION, askedChoices, userPromptPath);
//     scores.asked = askedValues;
//     const askedPassed: string[] = [];
//     for (const [choiceName, value] of Object.entries(askedValues)) {
//       const isPassing = value > SCORE_THRESHOLD;
//       if (isPassing) {
//         askedPassed.push(choiceName);
//         switch (choiceName) {
//           case "yes":
//             outcomes.add(OUTCOME_DO_NOT_BLOCK);
//             break;
//           case "no":
//             outcomes.add(OUTCOME_BLOCK_ASK);
//             break;
//         }
//       }
//     }
//     const isAskedEmpty = askedPassed.length === 0;
//     if (isAskedEmpty)
//       outcomes.add(OUTCOME_DO_NOT_BLOCK);
//     else
//       passed.asked = askedPassed;
//   }

//   if (isListedReached) {
//     const listedValues = await computeNodeValues(state, LISTED_QUESTION, listedChoices, userPromptAndTaskListPaths);
//     scores.listed = listedValues;
//     const listedPassed: string[] = [];
//     for (const [choiceName, value] of Object.entries(listedValues)) {
//       const isPassing = value > SCORE_THRESHOLD;
//       if (isPassing) {
//         listedPassed.push(choiceName);
//         switch (choiceName) {
//           case "yes":
//             outcomes.add(OUTCOME_DO_NOT_BLOCK);
//             break;
//           case "no":
//             outcomes.add(OUTCOME_BLOCK_TASK);
//             break;
//         }
//       }
//     }
//     const isListedEmpty = listedPassed.length === 0;
//     if (isListedEmpty)
//       outcomes.add(OUTCOME_DO_NOT_BLOCK);
//     else
//       passed.listed = listedPassed;
//   }

//   return { passed, outcomes: [...outcomes], scores };
// }

// // bun mod/tests/typesafe-checker.ts [--dry-run] [--withScores]; walks the flowchart for every reply in category-labels.json
// if (import.meta.main) {
//   const taskList = await loadTaskList();
//   const replies: { id: string; lineTexts: string[]; state: ReplyState }[] = [];
//   for (const reply of categoryLabels.replies) {
//     const lineTexts: string[] = [];
//     for (const line of reply.text)
//       lineTexts.push(line.text);
//     replies.push({ id: reply.id, lineTexts, state: { reply: { text: lineTexts.join("\n") }, userPrompt: reply.userPrompt, taskList } });
//   }
//   if (isPrintingRequests) {
//     console.log(JSON.stringify(buildNodeRequest(replies[0].state, ABOUT_QUESTION, aboutChoices, userPromptPath), null, 2));
//     process.exit(0);
//   }
//   const scoredReplies: ScoredReply[] = [];
//   // ponytail: 4 replies at a time; the SDK retries 429s
//   for (let i = 0; i < replies.length; i += 4) {
//     const batch = replies.slice(i, i + 4);
//     const pending: ReturnType<typeof computeReplyOutcomes>[] = [];
//     for (const reply of batch)
//       pending.push(computeReplyOutcomes(reply.state));
//     const results = await Promise.all(pending);
//     for (const [index, reply] of batch.entries()) {
//       const entry: ScoredReply = { id: reply.id, reply: reply.lineTexts, passed: results[index].passed, outcomes: results[index].outcomes };
//       if (isWritingScores)
//         entry.scores = results[index].scores;
//       console.log(JSON.stringify(entry));
//       scoredReplies.push(entry);
//     }
//   }
//   const isoTime = new Date().toISOString();
//   const timestamp = isoTime.slice(0, 19).replaceAll(":", "-");
//   const outPath = `${import.meta.dir}/results/typesafe-${timestamp}.json`;
//   await Bun.write(outPath, JSON.stringify({ threshold: SCORE_THRESHOLD, replies: scoredReplies }, null, 2));
//   console.log(outPath);
// }

