import type { EngineInterface } from 'claude-code';

export type EarlierAnswer = { question: string; answer: string };

export async function loadEarlierAnswers($: EngineInterface): Promise<EarlierAnswer[]> {
  const earlierAnswers: EarlierAnswer[] = [];
  const messages = await $.session.messages();
  for (const message of messages) {
    for (const toolUse of message.toolUses) {
      const isAskUserQuestion = toolUse.tool === 'AskUserQuestion';
      if (!isAskUserQuestion)
        continue;
      const record = toolUse.result as { answers?: Record<string, string> } | undefined;
      const hasAnswers = record?.answers !== undefined;
      if (!hasAnswers)
        continue;
      for (const [question, answer] of Object.entries(record!.answers!))
        earlierAnswers.push({ question, answer });
    }
  }
  return earlierAnswers;
}

export function formatEarlierAnswers(earlierAnswers: EarlierAnswer[]): string {
  const lines: string[] = [];
  for (const earlierAnswer of earlierAnswers)
    lines.push(`${earlierAnswer.question} -> ${earlierAnswer.answer}`);
  return lines.join('\n');
}
