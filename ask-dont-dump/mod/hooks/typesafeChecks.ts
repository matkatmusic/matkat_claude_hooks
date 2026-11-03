import type { EngineInterface } from 'claude-code';
import { loadOpenTasks, formatOpenTasks } from './taskList';
import type { FlaggedCheck } from './nudgeFile';
import { validateBacktickedKeys } from './typesafeSpellcheck';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_MODEL = 'jev-latest';
// const HOOK_ONLY_FIELDS = ['enabled', 'cutoff', 'flagChoices', 'did', 'do'];

type QuestionConfig = { enabled: unknown; activationThreshold: unknown; flagChoices?: unknown; did: unknown; do: unknown; expectedInputs?: unknown };
type QuestionBody = { type: unknown; instructions?: unknown; criteria?: unknown; [field: string]: unknown };
type QuestionEntry = { config: QuestionConfig; question: QuestionBody };
type EnabledQuestion = { activationThreshold: number; flagChoices: string[]; did: string; do: string; type: 'noul' | 'choice' };
type TypesafeAnswer = { type: string; noul?: number; probabilities?: Record<string, number> };

function buildQuestionsFilePath($: EngineInterface, questionsPath: string): string {
  const isAbsolutePath = questionsPath.startsWith('/');
  if (isAbsolutePath)
    return questionsPath;
  return `${$.plugin.root}/${questionsPath}`;
}

function validateQuestionFields(name: string, config: QuestionConfig): void {
  const hasThreshold = typeof config.activationThreshold === 'number';
  if (!hasThreshold)
    throw new Error(`ask-dont-dump: TypeSafe question ${name} has no numeric activationThreshold`);
  const hasDid = typeof config.did === 'string';
  const hasDo = typeof config.do === 'string';
  const hasDidAndDo = hasDid && hasDo;
  if (!hasDidAndDo)
    throw new Error(`ask-dont-dump: TypeSafe question ${name} needs a did and a do string`);
}

function validateEnabledQuestion(name: string, entry: QuestionEntry): EnabledQuestion {
  const { config, question } = entry;
  validateQuestionFields(name, config);
  const isNoul = question.type === 'noul';
  const isChoice = question.type === 'choice';
  const isKnownType = isNoul || isChoice;
  if (!isKnownType)
    throw new Error(`ask-dont-dump: TypeSafe question ${name} has type ${String(question.type)}, not noul or choice`);
  const hasFlagChoices = Array.isArray(config.flagChoices);
  const isMissingFlagChoices = isChoice && !hasFlagChoices;
  if (isMissingFlagChoices)
    throw new Error(`ask-dont-dump: TypeSafe choice question ${name} needs a flagChoices array`);
  const flagChoices = isChoice ? (config.flagChoices as string[]) : [];
  return { activationThreshold: config.activationThreshold as number, flagChoices, did: config.did as string, do: config.do as string, type: question.type as 'noul' | 'choice' };
}

// function buildRequestQuestion(question: TypesafeQuestion): Record<string, unknown> {
//   const requestQuestion: Record<string, unknown> = {};
//   for (const [field, value] of Object.entries(question)) {
//     const isHookOnlyField = HOOK_ONLY_FIELDS.includes(field);
//     if (isHookOnlyField)
//       continue;
//     requestQuestion[field] = value;
//   }
//   return requestQuestion;
// }

async function findLastUserPrompt($: EngineInterface): Promise<string> {
  const messages = await $.session.messages();
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    const hasToolResults = (message.toolResults ?? []).length > 0;
    const isUserText = message.role === 'user' && message.text !== '';
    const isRealPrompt = isUserText && !hasToolResults;
    if (isRealPrompt)
      return message.text;
  }
  throw new Error('ask-dont-dump: the session has no user prompt to send to TypeSafe');
}

function isAnswerFlagged(name: string, question: EnabledQuestion, answer: TypesafeAnswer): boolean {
  if (question.type === 'noul')
    return answer.noul! >= question.activationThreshold;
  let isFlagged = false;
  for (const choice of question.flagChoices) {
    const probability = answer.probabilities![choice];
    if (probability === undefined)
      throw new Error(`ask-dont-dump: TypeSafe answer for ${name} has no probability for ${choice}`);
    if (probability >= question.activationThreshold)
      isFlagged = true;
  }
  return isFlagged;
}

function validateEntryParts(name: string, entry: Partial<QuestionEntry>): void {
  const hasConfig = typeof entry.config === 'object' && entry.config !== null;
  if (!hasConfig)
    throw new Error(`ask-dont-dump: TypeSafe question ${name} has no config object`);
  const hasQuestion = typeof entry.question === 'object' && entry.question !== null;
  if (!hasQuestion)
    throw new Error(`ask-dont-dump: TypeSafe question ${name} has no question object`);
}

async function readEnabledQuestions($: EngineInterface, questionsPath: string): Promise<Record<string, QuestionEntry>> {
  const entries: Record<string, QuestionEntry> = JSON.parse(await $.fs.read(buildQuestionsFilePath($, questionsPath)));
  const enabledEntries: Record<string, QuestionEntry> = {};
  for (const [name, entry] of Object.entries(entries)) {
    validateEntryParts(name, entry);
    const isEnabledBoolean = typeof entry.config.enabled === 'boolean';
    if (!isEnabledBoolean)
      throw new Error(`ask-dont-dump: TypeSafe question ${name} needs enabled to be true or false`);
    if (entry.config.enabled)
      enabledEntries[name] = entry;
  }
  return enabledEntries;
}

async function fetchTypesafeAnswers($: EngineInterface, reply: string, requestQuestions: Record<string, QuestionBody>): Promise<Record<string, TypesafeAnswer>> {
  const apiKey = await $.env.get('TYPESAFE_API_KEY');
  if (!apiKey)
    throw new Error('ask-dont-dump: TYPESAFE_API_KEY is not set');
  const state = { agentReply: reply, userPrompt: await findLastUserPrompt($), openTasks: formatOpenTasks(await loadOpenTasks($)) };
  const response = await $.http.fetch(TYPESAFE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, questions: requestQuestions, model: TYPESAFE_MODEL }),
  });
  if (!response.ok)
    throw new Error(`ask-dont-dump: TypeSafe answered ${response.status}: ${response.text}`);
  return JSON.parse(response.text).answers;
}

function validateEnabledQuestions(enabledEntries: Record<string, QuestionEntry>): Record<string, EnabledQuestion> {
  const checks: Record<string, EnabledQuestion> = {};
  for (const [name, entry] of Object.entries(enabledEntries)) {
    checks[name] = validateEnabledQuestion(name, entry);
    validateBacktickedKeys(name, entry.config.expectedInputs, entry.question);
  }
  return checks;
}

function buildRequestQuestions(enabledEntries: Record<string, QuestionEntry>): Record<string, QuestionBody> {
  const requestQuestions: Record<string, QuestionBody> = {};
  for (const [name, entry] of Object.entries(enabledEntries))
    requestQuestions[name] = entry.question;
  return requestQuestions;
}

function filterFlaggedChecks(checks: Record<string, EnabledQuestion>, answers: Record<string, TypesafeAnswer>): FlaggedCheck[] {
  const flagged: FlaggedCheck[] = [];
  for (const [name, check] of Object.entries(checks)) {
    const isFlagged = isAnswerFlagged(name, check, answers[name]!);
    if (isFlagged)
      flagged.push({ did: check.did, do: check.do, proof: '' });
  }
  return flagged;
}

export async function collectTypesafeFlaggedChecks($: EngineInterface, reply: string, questionsPath: string): Promise<FlaggedCheck[]> {
  const enabledEntries = await readEnabledQuestions($, questionsPath);
  const checks = validateEnabledQuestions(enabledEntries);
  const enabledCount = Object.keys(checks).length;
  if (enabledCount === 0)
    return [];
  const answers = await fetchTypesafeAnswers($, reply, buildRequestQuestions(enabledEntries));
  return filterFlaggedChecks(checks, answers);
}
