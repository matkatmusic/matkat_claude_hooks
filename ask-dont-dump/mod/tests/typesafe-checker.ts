import { noul, type NoulResponse, type Questions, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();

// a reply is in each category whose yes/no score is 0.5 or more
const CATEGORY_THRESHOLD = 0.5;
const isPrintingRequests = process.argv.includes("--dry-run");

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

type LabeledReply = { id: string; text: { category: string[]; text: string }[] };
const categoryLabels: { categories: Record<string, string>; replies: LabeledReply[] } =
  await Bun.file(`${import.meta.dir}/category-labels.json`).json();
const replyCategories = categoryLabels.categories;

// one yes/no per category, so the categories do not compete
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
  const replies: { id: string; text: string; expected: string[] }[] = [];
  for (const reply of categoryLabels.replies) {
    const lineTexts: string[] = [];
    const expectedSet = new Set<string>();
    for (const line of reply.text) {
      lineTexts.push(line.text);
      for (const category of line.category)
        expectedSet.add(category);
    }
    replies.push({ id: reply.id, text: lineTexts.join("\n"), expected: [...expectedSet] });
  }
  if (isPrintingRequests) {
    console.log(JSON.stringify(buildReplyRequest(replies[0].text), null, 2));
    process.exit(0);
  }
  const tallies: Record<string, { category: string; truePositives: number; falsePositives: number; falseNegatives: number }> = {};
  for (const category of Object.keys(replyCategories))
    tallies[category] = { category, truePositives: 0, falsePositives: 0, falseNegatives: 0 };
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
      for (const category of reply.expected) {
        const isMatched = matched.includes(category);
        if (isMatched)
          tallies[category].truePositives++;
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
      console.log(JSON.stringify({ id: reply.id, expected: reply.expected, matched, missed, extra, scores: results[index].scores }));
    }
  }
  for (const category of Object.keys(tallies))
    console.log(JSON.stringify(tallies[category]));
}
