import { test, expect } from 'claude-code/testing';
import { DISPATCH_TEXT, OPEN_SUBJECT, executeTurnAndWait, readNudgeFile, setUpCheckerStubs, type TypesafeStubs } from './checkerTestHelpers';
import { SEED_QUESTIONS } from './typesafeSeedCopy';

const USE_TYPESAFE_TEXT = '{ "enablements": {}, "values": { "ask-dont-dump": { "useTypesafe": true } } }';
const LAST_REAL_PROMPT = 'fix the crash';
const MESSAGES = [
  { role: 'user', text: 'an older prompt', toolUses: [] },
  { role: 'assistant', text: 'older reply', toolUses: [] },
  { role: 'user', text: LAST_REAL_PROMPT, toolUses: [] },
  { role: 'assistant', text: '', toolUses: [{ tool: 'Read' }] },
  { role: 'user', text: 'tool output text', toolUses: [], toolResults: [{ tool_use_id: 'x', text: 'tool output text', isError: false }] },
];
const DEFAULT_INPUTS = [{ name: 'agentReply', used: true }, { name: 'openTasks', used: true }, { name: 'userPrompt', used: false }];
const DEFAULT_QUESTION = {
  type: 'noul',
  instructions: { background: '`agentReply` is a reply. `openTasks` lists tasks.', question: 'Is it so?' },
  criteria: { true: 'the `agentReply` says it', false: 'the `agentReply` does not say it' },
};

function buildQuestionsText(questions: Record<string, unknown>): string {
  return JSON.stringify(questions);
}

function buildNoulEntry(name: string, configOverrides: Record<string, unknown> = {}, questionOverrides: Record<string, unknown> = {}) {
  const config = { enabled: true, activationThreshold: 0.7, did: `did ${name}`, do: `do ${name}`, expectedInputs: DEFAULT_INPUTS, ...configOverrides };
  return { config, question: { ...DEFAULT_QUESTION, ...questionOverrides } };
}

function buildChoiceEntry(name: string, activationThreshold: number, flagChoices: string[]) {
  const config = { enabled: true, activationThreshold, flagChoices, did: `did ${name}`, do: `do ${name}`, expectedInputs: DEFAULT_INPUTS };
  return { config, question: { ...DEFAULT_QUESTION, type: 'choice' } };
}

function buildAnswersText(answers: Record<string, unknown>): string {
  return JSON.stringify({ model: 'jev-latest', answers, usage: {} });
}

function buildQuietAnswersText(): string {
  return buildAnswersText({ alpha: { type: 'noul', noul: 0.1 } });
}

function setUpTypesafeStubs(on: any, typesafe: TypesafeStubs, messages: unknown[] = MESSAGES) {
  const stubs = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], DISPATCH_TEXT, USE_TYPESAFE_TEXT, true, undefined, [], messages, typesafe);
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }));
  return stubs;
}

function readFailureLog(fileWrites: { path: string; text: string }[]): string {
  for (const write of fileWrites) {
    const isFailureLog = write.path.endsWith('/ask-dont-dump.log');
    if (isFailureLog)
      return write.text;
  }
  throw new Error('no failure log was written');
}

function hasFailureLog(fileWrites: { path: string; text: string }[]): boolean {
  for (const write of fileWrites) {
    const isFailureLog = write.path.endsWith('/ask-dont-dump.log');
    if (isFailureLog)
      return true;
  }
  return false;
}

test('test_use_typesafe_true_sends_one_request_and_no_model_call', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const fetchText = buildAnswersText({ alpha: { type: 'noul', noul: 0.9 } });
  const { fetchCalls, modelCalls } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(modelCalls.count).toBe(0);
});

test('test_flagged_typesafe_question_writes_did_and_do_with_empty_proof', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const fetchText = buildAnswersText({ alpha: { type: 'noul', noul: 0.9 } });
  const { fileWrites, submittedTexts } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(readNudgeFile(fileWrites)).toEqual([{ did: 'did alpha', do: 'do alpha', proof: '' }]);
  expect(submittedTexts).toHaveLength(1);
});

test('test_request_state_holds_only_the_three_allowed_keys', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($, 'the reply text');
  const body = JSON.parse(fetchCalls[0]?.init.body);
  expect(Object.keys(body.state).sort()).toEqual(['agentReply', 'openTasks', 'userPrompt']);
  expect(body.state.agentReply).toBe('the reply text');
  expect(body.state.openTasks).toContain(OPEN_SUBJECT);
});

test('test_request_sends_every_state_key_when_user_prompt_is_not_used', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  const body = JSON.parse(fetchCalls[0]?.init.body);
  expect(body.state.userPrompt).toBe(LAST_REAL_PROMPT);
});

test('test_request_questions_equal_the_question_objects_with_no_config_data', async ($, on) => {
  const alphaEntry = buildNoulEntry('alpha');
  const gammaEntry = buildChoiceEntry('gamma', 0.6, ['bad']);
  const questionsText = buildQuestionsText({ alpha: alphaEntry, gamma: gammaEntry });
  const fetchText = buildAnswersText({ alpha: { type: 'noul', noul: 0.1 }, gamma: { type: 'choice', choice: 'ok', confidence: 0.9, probabilities: { ok: 0.9, bad: 0.1 } } });
  const { fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  const body = JSON.parse(fetchCalls[0]?.init.body);
  expect(body.model).toBe('jev-latest');
  expect(body.questions).toEqual({ alpha: alphaEntry.question, gamma: gammaEntry.question });
});

test('test_request_carries_the_api_key_as_a_bearer_header', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fetchCalls } = setUpTypesafeStubs(on, { questionsText, apiKey: 'key-123', fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls[0]?.url).toBe('https://api.typesafe.ai/v1/systemone');
  expect(fetchCalls[0]?.init.method).toBe('POST');
  expect(fetchCalls[0]?.init.headers.Authorization).toBe('Bearer key-123');
});

test('test_disabled_question_is_left_out_of_the_request', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha'), beta: buildNoulEntry('beta', { enabled: false, activationThreshold: undefined }) });
  const { fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  const body = JSON.parse(fetchCalls[0]?.init.body);
  expect(Object.keys(body.questions)).toEqual(['alpha']);
});

test('test_all_questions_disabled_sends_no_request_and_no_nudge', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { enabled: false }), beta: buildNoulEntry('beta', { enabled: false }) });
  const { fetchCalls, fileWrites, submittedTexts } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(0);
  expect(fileWrites).toHaveLength(0);
  expect(submittedTexts).toHaveLength(0);
});

test('test_noul_below_the_threshold_flags_nothing', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { submittedTexts, fileWrites } = setUpTypesafeStubs(on, { questionsText, fetchText: buildAnswersText({ alpha: { type: 'noul', noul: 0.69 } }) });
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(0);
  expect(fileWrites).toHaveLength(0);
});

test('test_noul_at_the_threshold_flags_the_question', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { activationThreshold: 0.5 }) });
  const { fileWrites } = setUpTypesafeStubs(on, { questionsText, fetchText: buildAnswersText({ alpha: { type: 'noul', noul: 0.5 } }) });
  await executeTurnAndWait($);
  expect(readNudgeFile(fileWrites)).toHaveLength(1);
});

test('test_flagged_questions_are_written_in_file_order', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { activationThreshold: 0.5 }), beta: buildNoulEntry('beta', { activationThreshold: 0.5 }) });
  const fetchText = buildAnswersText({ beta: { type: 'noul', noul: 0.9 }, alpha: { type: 'noul', noul: 0.9 } });
  const { fileWrites } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(readNudgeFile(fileWrites).map(item => item.did)).toEqual(['did alpha', 'did beta']);
});

test('test_choice_flags_from_probabilities_not_confidence', async ($, on) => {
  const questionsText = buildQuestionsText({ gamma: buildChoiceEntry('gamma', 0.6, ['bad']) });
  const fetchText = buildAnswersText({ gamma: { type: 'choice', choice: 'ok', confidence: 0.99, probabilities: { ok: 0.99, bad: 0.01 } } });
  const { fileWrites, submittedTexts } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(0);
  expect(fileWrites).toHaveLength(0);
});

test('test_choice_flags_when_a_flag_choice_probability_reaches_the_threshold', async ($, on) => {
  const questionsText = buildQuestionsText({ gamma: buildChoiceEntry('gamma', 0.6, ['bad', 'worse']) });
  const fetchText = buildAnswersText({ gamma: { type: 'choice', choice: 'ok', confidence: 0.1, probabilities: { ok: 0.1, bad: 0.2, worse: 0.7 } } });
  const { fileWrites } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(readNudgeFile(fileWrites)).toEqual([{ did: 'did gamma', do: 'do gamma', proof: '' }]);
});

test('test_choice_with_a_flag_choice_missing_from_probabilities_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ gamma: buildChoiceEntry('gamma', 0.6, ['bad']) });
  const fetchText = buildAnswersText({ gamma: { type: 'choice', choice: 'ok', confidence: 0.9, probabilities: { ok: 0.9 } } });
  const { fileWrites, submittedTexts } = setUpTypesafeStubs(on, { questionsText, fetchText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('bad');
  expect(submittedTexts).toHaveLength(0);
});

test('test_missing_api_key_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, apiKey: '' });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('TYPESAFE_API_KEY');
  expect(fetchCalls).toHaveLength(0);
});

test('test_non_ok_response_throws_with_status_and_text', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fileWrites, submittedTexts } = setUpTypesafeStubs(on, { questionsText, fetchStatus: 429, fetchText: 'too many requests' });
  await executeTurnAndWait($);
  const failureLog = readFailureLog(fileWrites);
  expect(failureLog).toContain('429');
  expect(failureLog).toContain('too many requests');
  expect(submittedTexts).toHaveLength(0);
});

test('test_enabled_question_without_an_activation_threshold_throws_naming_the_question', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { activationThreshold: undefined }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_choice_question_without_flag_choices_throws_naming_the_question', async ($, on) => {
  const choiceEntry = buildChoiceEntry('gamma', 0.6, ['bad']);
  const config: Record<string, unknown> = choiceEntry.config;
  delete config.flagChoices;
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText: buildQuestionsText({ gamma: choiceEntry }) });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('gamma');
  expect(fetchCalls).toHaveLength(0);
});

test('test_question_with_an_unknown_type_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { type: 'number' }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_question_with_a_non_boolean_enabled_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { enabled: 'yes' }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_entry_without_a_config_throws_naming_the_question', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: { question: DEFAULT_QUESTION } });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_entry_without_a_question_throws_naming_the_question', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: { config: buildNoulEntry('alpha').config } });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_no_real_user_prompt_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText }, [{ role: 'assistant', text: 'hello', toolUses: [] }]);
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('prompt');
  expect(fetchCalls).toHaveLength(0);
});

test('test_misspelled_backticked_key_in_instructions_throws_and_sends_no_request', async ($, on) => {
  const instructions = { background: '`agentRepy` is a reply. `openTasks` lists tasks.', question: 'Is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  const failureLog = readFailureLog(fileWrites);
  expect(failureLog).toContain('alpha');
  expect(failureLog).toContain('agentRepy');
  expect(fetchCalls).toHaveLength(0);
});

test('test_misspelled_backticked_key_in_criteria_throws_and_sends_no_request', async ($, on) => {
  const criteria = { true: 'the `agentReply` says it', false: 'the `openTaks` lists it' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { criteria }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  const failureLog = readFailureLog(fileWrites);
  expect(failureLog).toContain('alpha');
  expect(failureLog).toContain('openTaks');
  expect(fetchCalls).toHaveLength(0);
});

test('test_used_true_key_absent_from_the_text_throws', async ($, on) => {
  const instructions = { background: '`agentReply` is a reply.', question: 'Is it so?' };
  const criteria = { true: 'the `agentReply` says it', false: 'it does not' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { instructions, criteria }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  const failureLog = readFailureLog(fileWrites);
  expect(failureLog).toContain('alpha');
  expect(failureLog).toContain('openTasks');
  expect(fetchCalls).toHaveLength(0);
});

test('test_used_false_key_absent_from_the_text_passes', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha') });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(hasFailureLog(fileWrites)).toBe(false);
});

test('test_used_false_key_present_in_the_text_passes', async ($, on) => {
  const instructions = { background: '`agentReply` is a reply. `openTasks` lists tasks. `userPrompt` is the prompt.', question: 'Is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(hasFailureLog(fileWrites)).toBe(false);
});

test('test_same_typo_in_expected_inputs_and_the_text_throws', async ($, on) => {
  const expectedInputs = [{ name: 'agentRepy', used: true }, { name: 'openTasks', used: true }];
  const instructions = { background: '`agentRepy` is a reply. `openTasks` lists tasks.', question: 'Is it so?' };
  const criteria = { true: 'the `agentRepy` says it', false: 'it does not' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs }, { instructions, criteria }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  const failureLog = readFailureLog(fileWrites);
  expect(failureLog).toContain('alpha');
  expect(failureLog).toContain('agentRepy');
  expect(fetchCalls).toHaveLength(0);
});

test('test_dotted_name_passes_when_listed_in_expected_inputs', async ($, on) => {
  const expectedInputs = [...DEFAULT_INPUTS, { name: 'openTasks.0', used: true }];
  const instructions = { background: '`agentReply` is a reply. `openTasks` lists tasks. `openTasks.0` is the first.', question: 'Is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs }, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(hasFailureLog(fileWrites)).toBe(false);
});

test('test_dotted_name_not_listed_in_expected_inputs_throws', async ($, on) => {
  const instructions = { background: '`agentReply` is a reply. `openTasks` lists tasks. `openTasks.0` is the first.', question: 'Is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', {}, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('openTasks.0');
  expect(fetchCalls).toHaveLength(0);
});

test('test_name_that_is_an_instructions_field_passes', async ($, on) => {
  const expectedInputs = [...DEFAULT_INPUTS, { name: 'exclusions', used: true }];
  const instructions = { background: '`agentReply` is a reply. `openTasks` lists tasks.', exclusions: ['a thing'], question: 'Given `exclusions`, is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs }, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(hasFailureLog(fileWrites)).toBe(false);
});

test('test_name_that_is_not_a_state_key_or_instructions_field_throws', async ($, on) => {
  const expectedInputs = [...DEFAULT_INPUTS, { name: 'exclusions', used: false }];
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('exclusions');
  expect(fetchCalls).toHaveLength(0);
});

test('test_disabled_question_with_a_typo_is_not_checked', async ($, on) => {
  const instructions = { background: '`agentRepy` is a reply.', question: 'Is it so?' };
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha'), beta: buildNoulEntry('beta', { enabled: false }, { instructions }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText, fetchText: buildQuietAnswersText() });
  await executeTurnAndWait($);
  expect(fetchCalls).toHaveLength(1);
  expect(hasFailureLog(fileWrites)).toBe(false);
});

test('test_expected_inputs_that_is_not_an_array_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs: 'agentReply' }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_expected_input_with_a_non_string_name_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs: [{ name: 7, used: true }] }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_expected_input_with_a_non_boolean_used_throws', async ($, on) => {
  const questionsText = buildQuestionsText({ alpha: buildNoulEntry('alpha', { expectedInputs: [{ name: 'agentReply', used: 'yes' }] }) });
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText });
  await executeTurnAndWait($);
  expect(readFailureLog(fileWrites)).toContain('alpha');
  expect(fetchCalls).toHaveLength(0);
});

test('test_seed_questions_pass_the_spellcheck_and_send_one_request', async ($, on) => {
  const answers: Record<string, unknown> = {};
  for (const name of Object.keys(SEED_QUESTIONS))
    answers[name] = { type: 'noul', noul: 0.1 };
  const { fileWrites, fetchCalls } = setUpTypesafeStubs(on, { questionsText: JSON.stringify(SEED_QUESTIONS), fetchText: buildAnswersText(answers) });
  await executeTurnAndWait($);
  expect(hasFailureLog(fileWrites)).toBe(false);
  expect(fetchCalls).toHaveLength(1);
  expect(Object.keys(JSON.parse(fetchCalls[0]?.init.body).questions)).toEqual(Object.keys(SEED_QUESTIONS));
});
