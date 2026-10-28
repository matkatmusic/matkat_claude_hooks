import { test, expect } from 'claude-code/testing';
import { DISPATCH_TEXT, DISPATCH_OFF_TEXT, NUDGE_REPLY, executeTurnAndWait, setUpCheckerStubs } from './checkerTestHelpers';

test('test_all_no_answers_submit_no_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'no', 'no']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(0);
});

test('test_question_or_choice_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['yes', 'no', 'no']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(1);
});

test('test_unfinished_work_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'yes', 'no']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(1);
});

test('test_bug_report_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'no', 'yes']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(1);
});

test('test_three_yes_answers_submit_one_combined_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['yes', 'yes', 'yes']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(1);
});

test('test_disabled_in_dispatch_json_skips_the_checker', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], DISPATCH_OFF_TEXT);
  await executeTurnAndWait($);
  expect(modelCalls.count).toBe(0);
  expect(submittedTexts).toHaveLength(0);
});

test('test_user_dispatch_json_true_overrides_default_false', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], DISPATCH_OFF_TEXT, '{ "enablements": { "ask-dont-dump": { "turn.complete": true } } }');
  await executeTurnAndWait($);
  expect(modelCalls.count).toBe(3);
  expect(submittedTexts).toHaveLength(1);
});

test('test_reply_that_answers_the_nudge_is_skipped', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes']);
  await $.prompt.submit(NUDGE_REPLY);
  await executeTurnAndWait($);
  expect(modelCalls.count).toBe(0);
  expect(submittedTexts).toEqual(['nudge']);
});

// The engine skips a hook that throws, so a thrown error shows as no prompt submitted.
test('test_model_with_no_answer_makes_the_hook_throw_and_submits_no_prompt', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, [], DISPATCH_TEXT, undefined, false);
  await executeTurnAndWait($);
  expect(modelCalls.count).toBeGreaterThan(0);
  expect(submittedTexts).toHaveLength(0);
});

// test('test_reply_that_passes_submits_no_prompt', async ($, on) => {
//   const { submittedTexts } = setUpCheckerStubs(on, '{"ok": true}')
//   await $.turn.complete(ANSWER)
//   expect(submittedTexts).toEqual([])
// })
//
// test('test_reply_that_fails_submits_the_reason', async ($, on) => {
//   const { submittedTexts } = setUpCheckerStubs(on, '{"ok": false, "reason": "R"}')
//   await $.turn.complete(ANSWER)
//   await new Promise(resolve => setTimeout(resolve, 0))
//   expect(submittedTexts).toEqual(['R'])
// })
//
// test('test_reply_wrapped_in_a_code_fence_still_submits_the_reason', async ($, on) => {
//   const { submittedTexts } = setUpCheckerStubs(on, '```json\n{"ok": false, "reason": "R"}\n```')
//   await $.turn.complete(ANSWER)
//   await new Promise(resolve => setTimeout(resolve, 0))
//   expect(submittedTexts).toEqual(['R'])
// })
