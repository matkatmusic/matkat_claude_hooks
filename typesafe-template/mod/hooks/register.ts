import type { EngineInterface, Hook, HttpResponse, Register } from 'claude-code';

const ENABLE_RESPONSE_LOGGING = true;
let shouldLogResponse: boolean = ENABLE_RESPONSE_LOGGING;

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_MODEL = 'jev-latest';
const WHOLE_PLACEHOLDER_PATTERN = /^\{\{\s*([^{}\s]+)\s*\}\}$/;
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const TIME_SEPARATOR_PATTERN = /[:.]/g;

type PlaceholderSources = { hook: unknown; other: Record<string, unknown> };
type TypesafeAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; probabilities: Record<string, number> };
type TypesafeAnswers = Record<string, TypesafeAnswer>;
type LoggedQuestion = { instructions?: unknown; criteria?: any };

async function readLoggingSetting($: EngineInterface, dispatchFilePath: string): Promise<boolean | undefined> {
  const fileExists = await $.fs.exists(dispatchFilePath);
  if (fileExists) {
    const dispatchSettings = JSON.parse(await $.fs.read(dispatchFilePath));
    if (typeof dispatchSettings.values === 'object') {
      const modValues = dispatchSettings.values[$.plugin.name];
      if (modValues !== undefined) {
        if (modValues.loggingEnabled !== undefined)
          return modValues.loggingEnabled;
      }
    }
  }
  return undefined;
}

async function loadLoggingSetting($: EngineInterface): Promise<void> {
  const dispatcherFolder = `${$.plugin.root}/../../dispatcher`;
  const userLoggingSetting = await readLoggingSetting($, `${dispatcherFolder}/user-dispatch.json`);
  if (userLoggingSetting !== undefined) {
    shouldLogResponse = userLoggingSetting;
    return;
  }
  const defaultLoggingSetting = await readLoggingSetting($, `${dispatcherFolder}/dispatch.json`);
  if (defaultLoggingSetting !== undefined)
    shouldLogResponse = defaultLoggingSetting;
}

function formatCriteriaText(criteriaValue: unknown): string {
  if (typeof criteriaValue === 'string')
    return criteriaValue;
  return JSON.stringify(criteriaValue);
}

function formatAskedText(instructions: unknown): string {
  if (typeof instructions === 'string')
    return instructions;
  if (typeof instructions === 'object') {
    if (instructions !== null) {
      const question = (instructions as { question?: unknown }).question;
      if (typeof question === 'string')
        return question;
    }
  }
  return JSON.stringify(instructions);
}

function formatNoulAnswerForLog(noul: number, criteria: any): string {
  const isYes = noul >= 0.5;
  const yesOrNo = isYes ? 'Yes' : 'No';
  if (criteria === undefined)
    return yesOrNo;
  if (criteria === null)
    return yesOrNo;
  const criteriaKey = isYes ? 'true' : 'false';
  const criteriaValue = criteria[criteriaKey];
  if (criteriaValue === undefined)
    return `${yesOrNo}, <no defined value in 'criteria'>`;
  return `${yesOrNo}, ${formatCriteriaText(criteriaValue)}`;
}

function findMostLikelyScoreLevel(probabilities: Record<string, number>): number {
  let mostLikelyLevel = '';
  let highestProbability = -1;
  for (const [level, probability] of Object.entries(probabilities)) {
    if (probability > highestProbability) {
      mostLikelyLevel = level;
      highestProbability = probability;
    }
  }
  return Number(mostLikelyLevel);
}

function formatAnswerForLog(questionName: string, answer: TypesafeAnswer, criteria: any): string {
  if (answer.type === 'noul')
    return formatNoulAnswerForLog(answer.noul, criteria);
  if (answer.type === 'choice')
    return formatCriteriaText(criteria[answer.choice]);
  if (answer.type === 'score')
    return formatCriteriaText(criteria[findMostLikelyScoreLevel(answer.probabilities)]);
  throw new Error(`typesafe-template: question ${questionName} has an unknown answer type`);
}

async function writeResponseToLogFile($: EngineInterface, response: HttpResponse, questions: unknown, now: number): Promise<void> {
  const answers: TypesafeAnswers = JSON.parse(response.text).answers;
  const questionsByName = questions as Record<string, LoggedQuestion>;
  const log: Record<string, { asked: string; answer: string }> = {};
  for (const [questionName, answer] of Object.entries(answers)) {
    const question = questionsByName[questionName]!;
    log[questionName] = { asked: formatAskedText(question.instructions), answer: formatAnswerForLog(questionName, answer, question.criteria) };
  }
  const fileName = `${new Date(now).toISOString().replace(TIME_SEPARATOR_PATTERN, '-')}.json`;
  await $.fs.write(`${$.plugin.root}/hooks/results/${fileName}`, JSON.stringify(log, null, 4));
}

// Add other data here. state.json reads each key as {{other.<key>}}.
async function readOtherData($: EngineInterface): Promise<Record<string, unknown>> {
  return { projectFolder: await $.session.root() };
}

async function readJsonFile($: EngineInterface, fileName: string): Promise<unknown> {
  return JSON.parse(await $.fs.read(`${$.plugin.root}/hooks/${fileName}`));
}

function readSourceValue(sources: PlaceholderSources, path: string): unknown {
  let value: any = sources;
  for (const key of path.split('.'))
    value = value?.[key];
  if (value === undefined)
    throw new Error(`typesafe-template: state.json placeholder {{${path}}} has no value`);
  return value;
}

function formatValueAsText(value: unknown): string {
  if (typeof value === 'string')
    return value;
  return JSON.stringify(value);
}

function fillText(text: string, sources: PlaceholderSources): unknown {
  const wholeMatch = WHOLE_PLACEHOLDER_PATTERN.exec(text);
  if (wholeMatch !== null)
    return readSourceValue(sources, wholeMatch[1]!);
  function fillPlaceholder(_placeholder: string, path: string): string {
    return formatValueAsText(readSourceValue(sources, path));
  }
  return text.replace(PLACEHOLDER_PATTERN, fillPlaceholder);
}

function fillStateList(items: unknown[], sources: PlaceholderSources): unknown[] {
  const filledItems: unknown[] = [];
  for (const item of items)
    filledItems.push(fillStateTemplate(item, sources));
  return filledItems;
}

function fillStateTemplate(template: unknown, sources: PlaceholderSources): unknown {
  if (typeof template === 'string')
    return fillText(template, sources);
  if (typeof template !== 'object')
    return template;
  if (template === null)
    return template;
  const isList = Array.isArray(template);
  if (isList)
    return fillStateList(template, sources);
  const filledFields: Record<string, unknown> = {};
  for (const [fieldName, fieldValue] of Object.entries(template))
    filledFields[fieldName] = fillStateTemplate(fieldValue, sources);
  return filledFields;
}

async function fetchTypesafeAnswers($: EngineInterface, state: unknown, questions: unknown): Promise<TypesafeAnswers> {
  const apiKey = await $.env.get('TYPESAFE_API_KEY');
  if (!apiKey)
    throw new Error('typesafe-template: TYPESAFE_API_KEY is not set');
  const response = await $.http.fetch(TYPESAFE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, questions, model: TYPESAFE_MODEL }),
  });
  if (!response.ok)
    throw new Error(`typesafe-template: TypeSafe answered ${response.status}: ${response.text}`);
  if (shouldLogResponse === true)
    await writeResponseToLogFile($, response, questions, await $.clock.now());
  return JSON.parse(response.text).answers;
}

function formatAnswerAsText(questionName: string, answer: TypesafeAnswer): string {
  if (answer.type === 'noul')
    return `${questionName}: yes chance ${answer.noul}`;
  if (answer.type === 'choice')
    return `${questionName}: ${answer.choice} (chance ${answer.probabilities[answer.choice]})`;
  if (answer.type === 'score')
    return `${questionName}: score ${answer.score}`;
  throw new Error(`typesafe-template: question ${questionName} has an unknown answer type`);
}

// Change this to use the answers. hookInput is the hook input. answers has one entry per question in questions.json.
function reportAnswers($: EngineInterface, hookInput: unknown, answers: TypesafeAnswers): void {
  const answerLines: string[] = [];
  for (const [questionName, answer] of Object.entries(answers))
    answerLines.push(formatAnswerAsText(questionName, answer));
  $.ui.toast(answerLines.join('\n'));
}

// To use another event, change the event name here and in register.
const sendHookInputToTypesafe: Hook<'turn.complete'> = async ($, e, next) => {
  await loadLoggingSetting($);
  const questions = await readJsonFile($, 'questions.json');
  const stateTemplate = await readJsonFile($, 'state.json');
  const sources = { hook: e, other: await readOtherData($) };
  const state = fillStateTemplate(stateTemplate, sources);
  const answers = await fetchTypesafeAnswers($, state, questions);
  reportAnswers($, e, answers);
  return next(e);
};

export const register: Register = (on) => {
  on('turn.complete', sendHookInputToTypesafe);
};
