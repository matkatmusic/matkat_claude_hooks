import { test, expect } from 'claude-code/testing';
import { ANSWER, DISPATCH_TEXT,DISPATCH_OFF_TEXT, NUDGE_PATH, NUDGE_REPLY, executeTurnAndWait, readNudgeFile, setUpCheckerStubs } from './checkerTestHelpers';
import { REPLY_CHECKS } from './register';

test('test_a_throwing_hook_is_logged_under_claude_hooks_logs', async ($, on) => {
  const writes: { path: string; text: string }[] = [];
  on('fs.exists', () => ({ value: false }));
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined }; });
  on('session.root', () => ({ value: '/work/p' }));
  on('session.id', () => ({ value: 'sess-9' }));
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }));
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }));

  await $.turn.complete(ANSWER);
  expect(writes).toEqual([{ path: '/work/p/.claude_hooks/logs/2026-01-02/ask-dont-dump.log', text: '2026-01-02T03:04:05.000Z session=sess-9 event=turn.complete throw: no implementation for fs.read\n' }]);
});

test('test_all_no_answers_submit_no_prompt',async ($, on) => {
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
  expect(modelCalls.count).toBe(6);
  expect(submittedTexts).toHaveLength(1);
});

test('test_repo_state_claim_yes_writes_the_repo_state_item_to_the_nudge_file', async ($, on) => {
  const { submittedTexts, fileWrites } = setUpCheckerStubs(on, ['no', 'no', 'no', 'yes']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(1);
  const repoStateCheck = REPLY_CHECKS[3];
  if (repoStateCheck === undefined)
    throw new Error('REPLY_CHECKS has no fourth check');
  expect(readNudgeFile(fileWrites).map(item => item.did)).toEqual([repoStateCheck.did]);
});

test('test_missing_functionality_yes_writes_the_missing_functionality_item_to_the_nudge_file', async ($, on) => {
  const { fileWrites } = setUpCheckerStubs(on, ['no', 'no', 'no', 'no', 'no', 'yes']);
  await executeTurnAndWait($);
  const missingFunctionalityCheck = REPLY_CHECKS[5];
  if (missingFunctionalityCheck === undefined)
    throw new Error('REPLY_CHECKS has no sixth check');
  const nudgeFile = readNudgeFile(fileWrites);
  expect(nudgeFile).toHaveLength(1);
  expect(nudgeFile[0]?.did).toBe(missingFunctionalityCheck.did);
  expect(nudgeFile[0]?.do).toBe(missingFunctionalityCheck.do);
});

test('test_yes_with_a_sentence_in_the_reply_writes_the_file_and_submits_the_short_text', async ($, on) => {
  const { submittedTexts, fileWrites } = setUpCheckerStubs(on, ['yes', 'no', 'yes']);
  await executeTurnAndWait($, 'What next? There is a crash.');
  const nudgeFile = readNudgeFile(fileWrites);
  expect(nudgeFile).toHaveLength(2);
  expect(nudgeFile.map(item => item.proof)).toEqual(['What next? There is a crash.', 'What next? There is a crash.']);
  expect(submittedTexts).toHaveLength(1);
  expect(submittedTexts[0]).toContain(NUDGE_PATH);
});

test('test_yes_with_a_sentence_not_in_the_reply_submits_nothing', async ($, on) => {
  const { submittedTexts, fileWrites } = setUpCheckerStubs(on, ['yes-sentence-not-in-reply', 'yes-sentence-not-in-reply', 'yes-sentence-not-in-reply']);
  await executeTurnAndWait($);
  expect(submittedTexts).toHaveLength(0);
  expect(fileWrites).toHaveLength(0);
});

test('test_session_end_removes_the_nudge_file', async ($, on) => {
  const { processCalls } = setUpCheckerStubs(on, [], DISPATCH_TEXT, undefined, true, undefined, [NUDGE_PATH]);
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }));
  await $.session.end({ reason: 'other', sessionId: 'sess-9', resume: { sessionId: 'sess-9' } } as never);
  expect(processCalls).toEqual([['rm', NUDGE_PATH]]);
});

test('test_session_end_without_a_nudge_file_removes_nothing', async ($, on) => {
  const { processCalls } = setUpCheckerStubs(on, []);
  on('session.end', (_$: any, e: any) => ({ sessionId: e.sessionId }));
  await $.session.end({ reason: 'other', sessionId: 'sess-9', resume: { sessionId: 'sess-9' } } as never);
  expect(processCalls).toHaveLength(0);
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
