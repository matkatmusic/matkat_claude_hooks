import type { ChoiceResponse } from '@typesafe-ai/sdk';
import type { LabeledReply } from './checker5Calls';

// const YES_CONFIDENCE_THRESHOLD = 0.75;
const MIN_YES_PROBABILITY = 0.6;
// const CELL_TEXT_LIMIT = 60;

// type CustomQuestion = { ask: string; 'follow-ups'?: string[] };
type CustomQuestion = { active: boolean; ask: string; followUps?: { active: boolean; ask: string }[] };
type QuestionGroup = { active: boolean; [questionId: string]: CustomQuestion | boolean };
type ReplyResult = { main: { answers: Record<string, ChoiceResponse> } };

// function formatCellText(text: string) {
//   const oneLine = text.replace(/\s+/g, ' ').replaceAll('|', '\\|');
//   // const isTooLong = oneLine.length > CELL_TEXT_LIMIT;
//   // if (isTooLong)
//   //   return `${oneLine.slice(0, CELL_TEXT_LIMIT)}…`;
//   return oneLine;
// }

function computeTimestamp() {
  const isoTime = new Date().toISOString();
  return isoTime.slice(0, 19).replaceAll(':', '-');
}

// bun claude/claude_hooks/ask-dont-dump/mod/tests/writeYesTable.ts <results/responses-*.json>
if (import.meta.main) {
  const resultsPath = process.argv[2];
  if (resultsPath === undefined)
    throw new Error('missing <results/responses-*.json>');
  const categoryLabels: { replies: (LabeledReply & { labels: string[] })[] } =
    await Bun.file(`${import.meta.dir}/category-labels.json`).json();
  // const customFile: { questions: Record<string, CustomQuestion> } =
  const customFile: { questions: { groups: Record<string, QuestionGroup> } } =
    await Bun.file(`${import.meta.dir}/custom-questions.json`).json();
  const resultsByReply: Record<string, ReplyResult> = await Bun.file(resultsPath).json();
  // const questionIds = Object.keys(customFile.questions);
  const questionIds: string[] = [];
  for (const group of Object.values(customFile.questions.groups)) {
    const isGroupInactive = !group.active;
    if (isGroupInactive)
      continue;
    for (const [questionId, groupEntry] of Object.entries(group)) {
      const isGroupFlag = questionId === 'active';
      if (isGroupFlag)
        continue;
      const customQuestion = groupEntry as CustomQuestion;
      const isQuestionInactive = !customQuestion.active;
      if (isQuestionInactive)
        continue;
      questionIds.push(questionId);
    }
  }
  const lines: string[] = [];
  // lines.push(`| Reply | Prompt | Reply text | Your labels | ${questionIds.join(' | ')} |`);
  // lines.push(`|${'---|'.repeat(questionIds.length + 4)}`);
  for (const reply of categoryLabels.replies) {
    const answers = (resultsByReply[reply.id] as ReplyResult).main.answers;
    const replyLines: string[] = [];
    for (const line of reply.text)
      replyLines.push(line.text);
    const yesRows: { questionId: string; yesScore: number }[] = [];
    for (const questionId of questionIds) {
      const answer = answers[questionId] as ChoiceResponse;
      // const isYes = answer.choice === 'yes';
      // const isConfident = answer.confidence >= YES_CONFIDENCE_THRESHOLD;
      // const isConfidentYes = isYes && isConfident;
      const isConfidentYes = (answer.probabilities.yes as number) >= MIN_YES_PROBABILITY;
      if (!isConfidentYes)
        continue;
      const yesScore = answer.probabilities.yes as number;
      let insertIndex = yesRows.length;
      for (let index = 0; index < yesRows.length; index++) {
        const isHigherThanRow = yesScore > (yesRows[index] as { questionId: string; yesScore: number }).yesScore;
        if (isHigherThanRow) {
          insertIndex = index;
          break;
        }
      }
      yesRows.splice(insertIndex, 0, { questionId, yesScore });
    }
    // lines.push(`### ${reply.id}`);
    // lines.push(`Prompt: ${formatCellText(reply.userPrompt)}`);
    // lines.push(`Reply: ${formatCellText(replyLines.join(' '))}`);
    // lines.push(`Your labels: ${reply.labels.join(', ')}`);
    // lines.push('');
    // lines.push('**Prompt:**');
    // lines.push('````');
    // lines.push(reply.userPrompt);
    // lines.push('````');
    // lines.push('**Reply:**');
    // lines.push('````');
    // lines.push(replyLines.join('\n'));
    // lines.push('````');
    // lines.push('**Your labels:**');
    // lines.push('');
    // for (const label of reply.labels)
    //   lines.push(`- ${label}`);
    // lines.push('');
    lines.push(`# ${reply.id}`);
    lines.push('');
    lines.push('## Prompt');
    lines.push('````');
    lines.push(reply.userPrompt);
    lines.push('````');
    lines.push('');
    lines.push('## Reply');
    lines.push('````');
    lines.push(replyLines.join('\n'));
    lines.push('````');
    lines.push('');
    lines.push('## Labels');
    for (const label of reply.labels)
      lines.push(`- ${label}`);
    lines.push('');
    lines.push('## Scores');
    lines.push('| Question | yes |');
    lines.push('|---|---|');
    for (const yesRow of yesRows)
      lines.push(`| ${yesRow.questionId} | ${yesRow.yesScore.toFixed(2)} |`);
    lines.push('');
    // const cells: string[] = [];
    // for (const questionId of questionIds) {
    //   const answer = answers[questionId] as ChoiceResponse;
    //   const isYes = answer.choice === 'yes';
    //   const isConfident = answer.confidence >= YES_CONFIDENCE_THRESHOLD;
    //   const isConfidentYes = isYes && isConfident;
    //   if (isConfidentYes)
    //     cells.push((answer.probabilities.yes as number).toFixed(2));
    //   else
    //     cells.push('');
    // }
    // lines.push(`| ${reply.id} | ${formatCellText(reply.userPrompt)} | ${formatCellText(replyLines.join(' '))} | ${reply.labels.join(', ')} | ${cells.join(' | ')} |`);
  }
  const tablePath = `${import.meta.dir}/results/yes-table-${computeTimestamp()}.md`;
  await Bun.write(tablePath, `${lines.join('\n')}\n`);
  console.log(tablePath);
}
