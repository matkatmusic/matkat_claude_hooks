// import { noul, type NoulResponse, type Questions, TypeSafeClient } from "@typesafe-ai/sdk";
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { score, type Questions, type ScoreResponse, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

// const CATEGORY_THRESHOLD = 0.5;
const SCORE_THRESHOLD = 0.5;
const isPrintingRequests = process.argv.includes("--dry-run");
const isWritingScores = process.argv.includes("--withScores");

/*
const replyCategories: Record<string, { label: string; definition: string }> = {
  describesIssue: {
    label: "describes an issue",
    definition: "the reply tells about a problem that was discovered during the turn: a bug, an error, a failure, or something that does not work as expected",
  },
  leavesOpenDecision: {
    label: "leaves an open decision",
    definition: "the reply leaves a choice that nobody has made yet, for example two options with no pick, or a choice the user must still make",
  },
  mentionsOpenTasks: {
    label: "mentions open task list items",
    definition: "the reply mentions items on a task list or to-do list that are not done yet: pending, in progress, or still to do",
  },
  asksQuestion: {
    label: "asks a question",
    definition: "the reply asks the user a question that wants an answer",
  },
  invitesConsent: {
    label: "invites consent to proceed",
    definition: "the reply is prose that asks the user to approve going ahead with a task or job, as in \"Want me to apply it?\" or \"Say go and I will run it.\"",
  },
  statesNotChecked: {
    label: "states something was not checked",
    definition: "the reply says that something was not checked, not tested, not run, or not verified",
  },
  waitingForSubagent: {
    label: "waiting for a subagent",
    definition: "the reply says a helper, subagent, or background job is still running and the reply waits for its result",
  },
  startingMultiStepWork: {
    label: "starting multi-step work",
    definition: "the reply announces that it starts work with several steps, as in \"First I will read the files, then I will fix the test.\"",
  },
  declaresUnfinishedWork: {
    label: "declares unfinished work",
    definition: "the reply says that work is not finished in this turn: parts are left to do, or the work continues later",
  },
};
*/

type LabeledReply = { id: string; userPrompt: string; text: { category: string[]; text: string }[] };
type ScoredReply = { id: string; reply: string[]; passed: Record<string, string[]>; outcomes: string[]; scores?: Record<string, Record<string, number>> };
type TaskSummary = { id: string; subject: string; status: string };
type ReplyState = { reply: { text: string }; userPrompt: string; taskList: TaskSummary[] };
const categoryLabels: { replies: LabeledReply[] } =
  await Bun.file(`${import.meta.dir}/category-labels.json`).json();

const OUTCOME_DO_NOT_BLOCK = "do not block";
const OUTCOME_BLOCK_ASK = "block: AskUserQuestion";
const OUTCOME_BLOCK_TASK = "block: TaskCreate";

const ABOUT_QUESTION = "What is the reply about?";
const DOES_QUESTION = "What does the reply do?";
const WHO_QUESTION = "Who must act next, and when?";
const ASKED_QUESTION = "Did the user ask for this instruction?";
const LISTED_QUESTION = "Is all the work Claude owes already on the task list?";

const aboutChoices: Record<string, string> = {
  work: "work or task",
  check: "a check or test",
  code: "the code",
  decision: "a question or decision",
  helper: "a helper",
  taskList: "the task list",
  plan: "the method or plan",
  otherSession: "another session",
  bug: "a bug or problem",
};
const doesChoices: Record<string, string> = {
  fact: "states a fact",
  question: "asks a question",
  offer: "offers to do something or asks for approval",
  choices: "gives choices with no pick",
  decision: "records a decision the user made",
  answer: "answers a question with a confirmed answer",
  instruction: "tells the user to do something",
  guess: "states a guess, a gap, or an unconfirmed answer",
};
const whoChoices: Record<string, string> = {
  claudeNow: "Claude, starting work with several steps now",
  claudeLater: "Claude, after this turn",
  helper: "a helper, during this turn",
  user: "the user, after this turn",
  nobodyDone: "nobody: the work is done",
  nobodyOpen: "nobody yet: the work is still open",
};
const askedChoices: Record<string, string> = {
  yes: "yes, the user asked for it",
  no: "no, the user did not ask for it",
};
const listedChoices: Record<string, string> = {
  yes: "yes, all of it is on the task list",
  no: "no, some of it is not on the task list",
};

const userPromptPath = { userPrompt: "`userPrompt`" };
const userPromptAndTaskListPaths = { userPrompt: "`userPrompt`", taskList: "`taskList`" };

async function loadTaskList(): Promise<TaskSummary[]> {
  const settings = await Bun.file(`${process.cwd()}/.claude/settings.json`).json();
  const taskListId = settings.env.CLAUDE_CODE_TASK_LIST_ID;
  const taskDirectory = `${homedir()}/.claude/tasks/${taskListId}`;
  const taskList: TaskSummary[] = [];
  for (const fileName of readdirSync(taskDirectory)) {
    const isTaskFile = fileName.endsWith(".json");
    if (isTaskFile) {
      const task = await Bun.file(`${taskDirectory}/${fileName}`).json();
      taskList.push({ id: task.id, subject: task.subject, status: task.status });
    }
  }
  return taskList;
}

// one request for one flowchart question: one yes/no score question per choice
export function buildNodeRequest(state: ReplyState, nodeQuestion: string, choiceLabels: Record<string, string>, statePaths: Record<string, string>) {
  const questions: Questions = {};
  for (const [choiceName, choiceLabel] of Object.entries(choiceLabels)) {
    const instructions = {
      reply: "`reply.text`",
      ...statePaths,
      question: `\`reply\` is a message an AI assistant wrote to the user at the end of its turn. ${nodeQuestion} Is this answer right: ${choiceLabel}?`,
    };
    questions[choiceName] = score(instructions, ["no", "yes"]);
  }
  return { state, questions };
}

async function computeNodeValues(state: ReplyState, nodeQuestion: string, choiceLabels: Record<string, string>, statePaths: Record<string, string>) {
  const response = await client.systemOne(buildNodeRequest(state, nodeQuestion, choiceLabels, statePaths));
  const values: Record<string, number> = {};
  for (const [choiceName, answer] of Object.entries(response.answers))
    values[choiceName] = (answer as ScoreResponse).score;
  return values;
}

async function computeReplyOutcomes(state: ReplyState) {
  const outcomes = new Set<string>();
  const passed: Record<string, string[]> = {};
  const scores: Record<string, Record<string, number>> = {};
  let isWhoReached = false;
  let isAskedReached = false;
  let isListedReached = false;

  const aboutValues = await computeNodeValues(state, ABOUT_QUESTION, aboutChoices, userPromptPath);
  scores.about = aboutValues;
  // let highestChoiceName = "";
  // let highestValue = -1;
  // for (const [choiceName, value] of Object.entries(aboutValues)) {
  //   const isHigher = value > highestValue;
  //   if (isHigher) {
  //     highestChoiceName = choiceName;
  //     highestValue = value;
  //   }
  // }
  // const isAboutPassing = highestValue > SCORE_THRESHOLD;
  // if (!isAboutPassing) {
  //   outcomes.add(OUTCOME_DO_NOT_BLOCK);
  //   return { passed, outcomes: [...outcomes], scores };
  // }
  // passed.about = [highestChoiceName];
  const aboutPassed: string[] = [];
  for (const [choiceName, value] of Object.entries(aboutValues)) {
    const isPassing = value > SCORE_THRESHOLD;
    if (isPassing) {
      aboutPassed.push(choiceName);
    }
  }
  const isAboutPassing = aboutPassed.length > 0;
  if (!isAboutPassing) {
    outcomes.add(OUTCOME_DO_NOT_BLOCK);
    return { passed, outcomes: [...outcomes], scores };
  }
  passed.about = aboutPassed;

  const doesValues = await computeNodeValues(state, DOES_QUESTION, doesChoices, userPromptPath);
  scores.does = doesValues;
  const doesPassed: string[] = [];
  for (const [choiceName, value] of Object.entries(doesValues)) {
    const isPassing = value > SCORE_THRESHOLD;
    if (isPassing) {
      doesPassed.push(choiceName);
      switch (choiceName) {
        case "question":
        case "offer":
        case "choices":
        case "guess":
          outcomes.add(OUTCOME_BLOCK_ASK);
          break;
        case "decision":
        case "answer":
          outcomes.add(OUTCOME_DO_NOT_BLOCK);
          break;
        case "instruction":
          isAskedReached = true;
          break;
        case "fact":
          isWhoReached = true;
          break;
      }
    }
  }
  const isDoesEmpty = doesPassed.length === 0;
  if (isDoesEmpty)
    outcomes.add(OUTCOME_DO_NOT_BLOCK);
  else
    passed.does = doesPassed;

  if (isWhoReached) {
    const whoValues = await computeNodeValues(state, WHO_QUESTION, whoChoices, userPromptPath);
    scores.who = whoValues;
    const whoPassed: string[] = [];
    for (const [choiceName, value] of Object.entries(whoValues)) {
      const isPassing = value > SCORE_THRESHOLD;
      if (isPassing) {
        whoPassed.push(choiceName);
        switch (choiceName) {
          case "claudeNow":
          case "claudeLater":
          case "nobodyOpen":
            isListedReached = true;
            break;
          case "helper":
          case "nobodyDone":
            outcomes.add(OUTCOME_DO_NOT_BLOCK);
            break;
          case "user":
            isAskedReached = true;
            break;
        }
      }
    }
    const isWhoEmpty = whoPassed.length === 0;
    if (isWhoEmpty)
      outcomes.add(OUTCOME_DO_NOT_BLOCK);
    else
      passed.who = whoPassed;
  }

  if (isAskedReached) {
    const askedValues = await computeNodeValues(state, ASKED_QUESTION, askedChoices, userPromptPath);
    scores.asked = askedValues;
    const askedPassed: string[] = [];
    for (const [choiceName, value] of Object.entries(askedValues)) {
      const isPassing = value > SCORE_THRESHOLD;
      if (isPassing) {
        askedPassed.push(choiceName);
        switch (choiceName) {
          case "yes":
            outcomes.add(OUTCOME_DO_NOT_BLOCK);
            break;
          case "no":
            outcomes.add(OUTCOME_BLOCK_ASK);
            break;
        }
      }
    }
    const isAskedEmpty = askedPassed.length === 0;
    if (isAskedEmpty)
      outcomes.add(OUTCOME_DO_NOT_BLOCK);
    else
      passed.asked = askedPassed;
  }

  if (isListedReached) {
    const listedValues = await computeNodeValues(state, LISTED_QUESTION, listedChoices, userPromptAndTaskListPaths);
    scores.listed = listedValues;
    const listedPassed: string[] = [];
    for (const [choiceName, value] of Object.entries(listedValues)) {
      const isPassing = value > SCORE_THRESHOLD;
      if (isPassing) {
        listedPassed.push(choiceName);
        switch (choiceName) {
          case "yes":
            outcomes.add(OUTCOME_DO_NOT_BLOCK);
            break;
          case "no":
            outcomes.add(OUTCOME_BLOCK_TASK);
            break;
        }
      }
    }
    const isListedEmpty = listedPassed.length === 0;
    if (isListedEmpty)
      outcomes.add(OUTCOME_DO_NOT_BLOCK);
    else
      passed.listed = listedPassed;
  }

  return { passed, outcomes: [...outcomes], scores };
}

// bun mod/tests/typesafe-checker.ts [--dry-run] [--withScores]; walks the flowchart for every reply in category-labels.json
if (import.meta.main) {
  const taskList = await loadTaskList();
  const replies: { id: string; lineTexts: string[]; state: ReplyState }[] = [];
  for (const reply of categoryLabels.replies) {
    const lineTexts: string[] = [];
    for (const line of reply.text)
      lineTexts.push(line.text);
    replies.push({ id: reply.id, lineTexts, state: { reply: { text: lineTexts.join("\n") }, userPrompt: reply.userPrompt, taskList } });
  }
  if (isPrintingRequests) {
    console.log(JSON.stringify(buildNodeRequest(replies[0].state, ABOUT_QUESTION, aboutChoices, userPromptPath), null, 2));
    process.exit(0);
  }
  const scoredReplies: ScoredReply[] = [];
  // ponytail: 4 replies at a time; the SDK retries 429s
  for (let i = 0; i < replies.length; i += 4) {
    const batch = replies.slice(i, i + 4);
    const pending: ReturnType<typeof computeReplyOutcomes>[] = [];
    for (const reply of batch)
      pending.push(computeReplyOutcomes(reply.state));
    const results = await Promise.all(pending);
    for (const [index, reply] of batch.entries()) {
      const entry: ScoredReply = { id: reply.id, reply: reply.lineTexts, passed: results[index].passed, outcomes: results[index].outcomes };
      if (isWritingScores)
        entry.scores = results[index].scores;
      console.log(JSON.stringify(entry));
      scoredReplies.push(entry);
    }
  }
  const isoTime = new Date().toISOString();
  const timestamp = isoTime.slice(0, 19).replaceAll(":", "-");
  const outPath = `${import.meta.dir}/results/typesafe-${timestamp}.json`;
  await Bun.write(outPath, JSON.stringify({ threshold: SCORE_THRESHOLD, replies: scoredReplies }, null, 2));
  console.log(outPath);
}

/*
// old category checker, replaced by the flowchart code above one yes/no per category, so the categories do not compete
function createCategoryCheck(category: string) {
  return noul({
    reply: "`reply.text`",
    catDef: `\`categories.${category}\``,
    question: "`reply` is a message an AI assistant wrote to the user at the end of its turn. Is `reply` in the category defined as `catDef`?",
  } as any);
}

export function buildReplyRequest(text: string) {
  const questions: Questions = {};
  for (const category of Object.keys(replyCategories))
    questions[category] = createCategoryCheck(category);
  return { state: { reply: { text }, categories: replyCategories }, questions };
}

// each category's yes score, plus the categories at or above CATEGORY_THRESHOLD
export async function computeReplyScores(text: string) {
  const response = await client.systemOne(buildReplyRequest(text));
  const scores: Record<string, number> = {};
  const matchedCategories: string[] = [];
  for (const [category, answer] of Object.entries(response.answers)) {
    const yesScore = (answer as NoulResponse).noul;
    scores[category] = yesScore;
    const isInCategory = yesScore >= CATEGORY_THRESHOLD;
    if (isInCategory)
      matchedCategories.push(category);
  }
  return { scores, categories: matchedCategories };
}

// bun mod/tests/typesafe-checker.ts [--dry-run]; scores every reply in category-labels.json
if (import.meta.main) {
  const replies: { id: string; lineTexts: string[]; text: string; expected: string[] }[] = [];
  for (const reply of categoryLabels.replies) {
    const lineTexts: string[] = [];
    const expectedSet = new Set<string>();
    for (const line of reply.text) {
      lineTexts.push(line.text);
      for (const category of line.category)
        expectedSet.add(category);
    }
    replies.push({ id: reply.id, lineTexts, text: lineTexts.join("\n"), expected: [...expectedSet] });
  }
  if (isPrintingRequests) {
    console.log(JSON.stringify(buildReplyRequest(replies[0].text), null, 2));
    process.exit(0);
  }
  const tallies: Record<string, { category: string; truePositives: number; falsePositives: number; falseNegatives: number }> = {};
  for (const category of Object.keys(replyCategories))
    tallies[category] = { category, truePositives: 0, falsePositives: 0, falseNegatives: 0 };
  const scoredReplies: ScoredReply[] = [];
  // ponytail: 4 replies at a time; the SDK retries 429s
  for (let i = 0; i < replies.length; i += 4) {
    const batch = replies.slice(i, i + 4);
    const pending: ReturnType<typeof computeReplyScores>[] = [];
    for (const reply of batch)
      pending.push(computeReplyScores(reply.text));
    const results = await Promise.all(pending);
    for (const [index, reply] of batch.entries()) {
      const matched = results[index].categories;
      const missed: string[] = [];
      const extra: string[] = [];
      // const expectedAndFound: string[] = [];
      for (const category of reply.expected) {
        const isMatched = matched.includes(category);
        if (isMatched) {
          // expectedAndFound.push(category);
          tallies[category].truePositives++;
        }
        else {
          missed.push(category);
          tallies[category].falseNegatives++;
        }
      }
      for (const category of matched) {
        const isExpected = reply.expected.includes(category);
        if (!isExpected) {
          extra.push(category);
          tallies[category].falsePositives++;
        }
      }
      const scored = { id: reply.id, expected: reply.expected, matched, missed, extra, scores: results[index].scores };
      console.log(JSON.stringify(scored));
      const entry: ScoredReply = { id: reply.id, reply: reply.lineTexts };
      const hasExtra = extra.length > 0;
      if (hasExtra) {
        entry.typesafe = {};
        for (const category of extra)
          entry.typesafe[category] = replyCategories[category];
      }
      const hasMissed = missed.length > 0;
      if (hasMissed) {
        entry.missed = {};
        for (const category of missed)
          entry.missed[category] = replyCategories[category];
      }
      if (isWritingScores)
        entry.scores = results[index].scores;
      scoredReplies.push(entry);
    }
  }
  for (const category of Object.keys(tallies))
    console.log(JSON.stringify(tallies[category]));
  const isoTime = new Date().toISOString();
  const timestamp = isoTime.slice(0, 19).replaceAll(":", "-");
  const outPath = `${import.meta.dir}/results/typesafe-${timestamp}.json`;
  await Bun.write(outPath, JSON.stringify({ threshold: CATEGORY_THRESHOLD, categories: replyCategories, replies: scoredReplies, tallies: Object.values(tallies) }, null, 2));
  console.log(outPath);
}
*/
