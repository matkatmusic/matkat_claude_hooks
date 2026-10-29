import { test, expect } from 'claude-code/testing';

const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const ALL_ON = '{ "enablements": { "bug-report": { "prompt.submit": true }, "feature-request": { "prompt.submit": true }, "change-request": { "prompt.submit": true } } }';
const ALL_OFF = '{ "enablements": { "bug-report": { "prompt.submit": false }, "feature-request": { "prompt.submit": false }, "change-request": { "prompt.submit": false } } }';
const TYPED = { text: 'the save button does nothing', wait: false, origin: { kind: 'composer' } } as const;
const FROM_PLUGIN = { text: 'the save button does nothing', wait: false, origin: { kind: 'plugin', name: 'other-mod' } } as const;
const YES = '{"yes": ["the save button does"]}';
const NO = '{"no": []}';
const TWO_ITEMS = '{"yes": ["the save button does", "also the load menu is"]}';
const KEYWORDS =['reporting a bug', 'feature request', 'functionality of the tool'];

function findKeywordIndex(prompt: string): number {
  for (const [i, keyword] of KEYWORDS.entries()) {
    const hasKeyword = prompt.includes(keyword);
    if (hasKeyword)
      return i;
  }
  return -1;
}

// answers are given in this order: bug-report, feature-request, change-request
function setUpStubs(on: any, answers: string[], dispatchText = ALL_ON, isAnswered = true) {
  const seen = { context: undefined as readonly string[] | undefined, modelCalls: 0 };
  function getNoUserFile() {
    return { value: false };
  }
  function readDispatchText() {
    return { value: dispatchText };
  }
  function getClockNow() {
    return { value: 0 };
  }
  function getModelReply(_$: any, e: any) {
    const index = findKeywordIndex(e.prompt);
    const text = answers[index] ?? NO;
    seen.modelCalls++;
    if (!isAnswered)
      return { value: { isAnswered: false, reason: 'empty-reply' } };
    return { value: { isAnswered: true, text, usage: USAGE } };
  }
  function collectPromptContext(_$: any, e: any) {
    seen.context = e.context;
    return { text: e.text, context: e.context };
  }
  on('fs.exists', getNoUserFile);
  on('fs.read', readDispatchText);
  on('clock.now', getClockNow);
  on('model.complete', getModelReply);
  on('prompt.submit', collectPromptContext);
  return seen;
}

async function assertBugReportYesAddsOneBlock($: any, on: any) {
  const seen = setUpStubs(on, [YES, NO, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.context).toHaveLength(1);
}

async function assertFeatureRequestYesAddsOneBlock($: any, on: any) {
  const seen = setUpStubs(on, [NO, YES, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.context).toHaveLength(1);
}

async function assertChangeRequestYesAddsOneBlock($: any, on: any) {
  const seen = setUpStubs(on, [NO, NO, YES]);
  await $.prompt.submit(TYPED);
  expect(seen.context).toHaveLength(1);
}

async function assertThreeYesAnswersAddThreeDifferentBlocks($: any, on: any) {
  const seen = setUpStubs(on, [YES, YES, YES]);
  await $.prompt.submit(TYPED);
  expect(new Set(seen.context).size).toBe(3);
}

async function assertAllNoAddsNoContext($: any, on: any) {
  const seen = setUpStubs(on, [NO, NO, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.context).toBeUndefined();
}

async function assertDisabledHooksAskNoModel($: any, on: any) {
  const seen = setUpStubs(on, [YES, YES, YES], ALL_OFF);
  await $.prompt.submit(TYPED);
  expect(seen.context).toBeUndefined();
  expect(seen.modelCalls).toBe(0);
}

async function assertPluginOriginPromptIsNotClassified($: any, on: any) {
  const seen = setUpStubs(on, [YES, YES, YES]);
  await $.prompt.submit(FROM_PLUGIN);
  expect(seen.context).toBeUndefined();
  expect(seen.modelCalls).toBe(0);
}

// The engine skips a hook that throws, so a thrown error shows as a prompt with no context.
async function assertNoModelAnswerAddsNoContext($: any, on: any) {
  const seen = setUpStubs(on, [], ALL_ON, false);
  await $.prompt.submit(TYPED);
  expect(seen.modelCalls).toBeGreaterThan(0);
  expect(seen.context).toBeUndefined();
}

async function assertTwoItemsAreListedInTheContext($: any, on: any) {
  const seen = setUpStubs(on, [TWO_ITEMS, NO, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.context).toHaveLength(1);
  expect(seen.context?.[0]).toContain('"the save button does"');
  expect(seen.context?.[0]).toContain('"also the load menu is"');
}

async function assertNoItemsAddsNoContext($: any, on: any) {
  const seen = setUpStubs(on, [NO, NO, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.modelCalls).toBe(3);
  expect(seen.context).toBeUndefined();
}

// The engine skips a hook that throws, so a thrown error shows as a prompt with no context.
async function assertBadJsonMakesTheHookThrowAndAddsNoContext($: any, on: any) {
  const seen = setUpStubs(on, ['yes, a bug', NO, NO]);
  await $.prompt.submit(TYPED);
  expect(seen.modelCalls).toBeGreaterThan(0);
  expect(seen.context).toBeUndefined();
}

// The hook throws on bad JSON: it adds no context and its failure is logged.
async function assertThrowingHookIsLoggedAndAddsNoContext($: any, on: any) {
  const writes: { path: string; text: string }[] = [];
  const seen = setUpStubs(on, ['yes, a bug', NO, NO]);
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined }; });
  on('session.root', () => ({ value: '/work/p' }));
  on('session.id', () => ({ value: 'sess-9' }));
  await $.prompt.submit(TYPED);
  expect(seen.context).toBeUndefined();
  expect(writes).toHaveLength(1);
  expect(writes[0]?.path).toBe('/work/p/.claude_hooks/logs/1970-01-01/prompt-intent.log');
  expect(writes[0]?.text).toContain('1970-01-01T00:00:00.000Z session=sess-9 event=prompt.submit throw: ');
}

test('test_a_throwing_hook_is_logged_and_adds_no_context', assertThrowingHookIsLoggedAndAddsNoContext);
test('test_two_items_are_listed_in_the_context', assertTwoItemsAreListedInTheContext);
test('test_no_items_add_no_context', assertNoItemsAddsNoContext);
test('test_bad_json_makes_the_hook_throw_and_adds_no_context', assertBadJsonMakesTheHookThrowAndAddsNoContext);
test('test_bug_report_yes_adds_one_context_block', assertBugReportYesAddsOneBlock);
test('test_feature_request_yes_adds_one_context_block', assertFeatureRequestYesAddsOneBlock);
test('test_change_request_yes_adds_one_context_block', assertChangeRequestYesAddsOneBlock);
test('test_three_yes_answers_add_three_different_blocks', assertThreeYesAnswersAddThreeDifferentBlocks);
test('test_all_no_adds_no_context', assertAllNoAddsNoContext);
test('test_disabled_hooks_add_no_context_and_ask_no_model', assertDisabledHooksAskNoModel);
test('test_plugin_origin_prompt_is_not_classified', assertPluginOriginPromptIsNotClassified);
test('test_model_with_no_answer_makes_the_hook_throw_and_adds_no_context', assertNoModelAnswerAddsNoContext);
