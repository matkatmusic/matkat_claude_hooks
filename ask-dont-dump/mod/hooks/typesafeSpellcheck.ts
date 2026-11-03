const BACKTICK_PATTERN = /`([^`]+)`/g;
const STATE_KEYS = ['agentReply', 'userPrompt', 'openTasks'];

type ExpectedInput = { name: string; used: boolean };
type QuestionBody = { instructions?: unknown; criteria?: unknown };

function collectStrings(value: unknown, strings: string[]): void {
  if (typeof value === 'string') {
    strings.push(value);
    return;
  }
  const isContainer = typeof value === 'object' && value !== null;
  if (!isContainer)
    return;
  for (const nested of Object.values(value as object))
    collectStrings(nested, strings);
}

function collectBacktickedKeys(question: QuestionBody): string[] {
  const strings: string[] = [];
  collectStrings(question.instructions, strings);
  collectStrings(question.criteria, strings);
  const keys: string[] = [];
  for (const text of strings) {
    for (const match of text.matchAll(BACKTICK_PATTERN))
      keys.push(match[1]!);
  }
  return keys;
}

function validateExpectedInputsShape(questionName: string, expectedInputs: unknown): ExpectedInput[] {
  const isArray = Array.isArray(expectedInputs);
  if (!isArray)
    throw new Error(`ask-dont-dump: TypeSafe question ${questionName} needs an expectedInputs array`);
  for (const input of expectedInputs) {
    const hasStringName = typeof input?.name === 'string';
    if (!hasStringName)
      throw new Error(`ask-dont-dump: TypeSafe question ${questionName} has an expectedInputs entry with no string name`);
    const hasBooleanUsed = typeof input.used === 'boolean';
    if (!hasBooleanUsed)
      throw new Error(`ask-dont-dump: TypeSafe question ${questionName} expectedInputs entry ${input.name} needs used to be true or false`);
  }
  return expectedInputs;
}

function validateInputRoots(questionName: string, inputs: ExpectedInput[], question: QuestionBody): void {
  const isInstructionsObject = typeof question.instructions === 'object' && question.instructions !== null;
  const instructionFields = isInstructionsObject ? Object.keys(question.instructions as object) : [];
  for (const input of inputs) {
    const root = input.name.split('.')[0]!;
    const isKnownRoot = STATE_KEYS.includes(root) || instructionFields.includes(root);
    if (!isKnownRoot)
      throw new Error(`ask-dont-dump: TypeSafe question ${questionName} expectedInputs key ${input.name} is not a state key or an instructions field`);
  }
}

function validateBacktickedKeysAreListed(questionName: string, backtickedKeys: string[], inputs: ExpectedInput[]): void {
  const listedNames: string[] = [];
  for (const input of inputs)
    listedNames.push(input.name);
  for (const key of backtickedKeys) {
    const isListed = listedNames.includes(key);
    if (!isListed)
      throw new Error(`ask-dont-dump: TypeSafe question ${questionName} backticked key ${key} is not in expectedInputs`);
  }
}

function validateUsedInputsAreWritten(questionName: string, backtickedKeys: string[], inputs: ExpectedInput[]): void {
  for (const input of inputs) {
    const isWritten = backtickedKeys.includes(input.name);
    const isUsedButUnwritten = input.used && !isWritten;
    if (isUsedButUnwritten)
      throw new Error(`ask-dont-dump: TypeSafe question ${questionName} expectedInputs key ${input.name} is used but never in backticks`);
  }
}

export function validateBacktickedKeys(questionName: string, expectedInputs: unknown, question: QuestionBody): void {
  const inputs = validateExpectedInputsShape(questionName, expectedInputs);
  validateInputRoots(questionName, inputs, question);
  const backtickedKeys = collectBacktickedKeys(question);
  validateBacktickedKeysAreListed(questionName, backtickedKeys, inputs);
  validateUsedInputsAreWritten(questionName, backtickedKeys, inputs);
}
