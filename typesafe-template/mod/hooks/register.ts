import type { EngineInterface, Hook, Register } from 'claude-code';

const TYPESAFE_URL = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_MODEL = 'jev-latest';
const WHOLE_PLACEHOLDER_PATTERN = /^\{\{\s*([^{}\s]+)\s*\}\}$/;
const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\s]+)\s*\}\}/g;

type PlaceholderSources = { hook: unknown; other: Record<string, unknown> };
type TypesafeAnswer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number };
type TypesafeAnswers = Record<string, TypesafeAnswer>;

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
