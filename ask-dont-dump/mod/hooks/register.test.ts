import { test, expect } from 'claude-code/testing'

const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const NUDGE_REPLY = { text: 'nudge', wait: false, origin: { kind: 'plugin', name: 'ask-dont-dump' } } as const
const KEYWORDS = ['question or choice', 'incomplete or unstarted', 'a bug report']

const DISPATCH_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": true, "turn.complete": true } } }'
const DISPATCH_OFF_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": false, "turn.complete": false } } }'

function findKeywordIndex(prompt: string): number {
  for (const [i, keyword] of KEYWORDS.entries()) {
    const hasKeyword = prompt.includes(keyword)
    if (hasKeyword)
      return i
  }
  return -1
}

// answers are given in this order: question or choice, unfinished work, bug report
function setUpCheckerStubs(on: any, answers: string[], dispatchText = DISPATCH_TEXT, userDispatchText?: string, isAnswered = true) {
  const submittedTexts: string[] = []
  const modelCalls = { count: 0 }
  on('fs.exists', () => ({ value: userDispatchText !== undefined }))
  on('fs.read', (_$: any, e: any) => {
    const isUserDispatchFile = e.path.endsWith('user-dispatch.json')
    if (isUserDispatchFile)
      return { value: userDispatchText }
    return { value: dispatchText }
  })
  on('model.complete', (_$: any, e: any) => {
    modelCalls.count++
    if (!isAnswered)
      return { value: { isAnswered: false, reason: 'empty-reply' } }
    const text = answers[findKeywordIndex(e.prompt)] ?? 'no'
    return { value: { isAnswered: true, text, usage: USAGE } }
  })
  on('prompt.submit', (_$: any, e: any) => {
    submittedTexts.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { submittedTexts, modelCalls }
}

async function executeTurnAndWait($: any) {
  await $.turn.complete(ANSWER)
  await new Promise(resolve => setTimeout(resolve, 0))
}

test('test_all_no_answers_submit_no_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'no', 'no'])
  await executeTurnAndWait($)
  expect(submittedTexts).toHaveLength(0)
})

test('test_question_or_choice_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['yes', 'no', 'no'])
  await executeTurnAndWait($)
  expect(submittedTexts).toHaveLength(1)
})

test('test_unfinished_work_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'yes', 'no'])
  await executeTurnAndWait($)
  expect(submittedTexts).toHaveLength(1)
})

test('test_bug_report_yes_submits_one_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['no', 'no', 'yes'])
  await executeTurnAndWait($)
  expect(submittedTexts).toHaveLength(1)
})

test('test_three_yes_answers_submit_one_combined_prompt', async ($, on) => {
  const { submittedTexts } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'])
  await executeTurnAndWait($)
  expect(submittedTexts).toHaveLength(1)
})

test('test_disabled_in_dispatch_json_skips_the_checker', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], DISPATCH_OFF_TEXT)
  await executeTurnAndWait($)
  expect(modelCalls.count).toBe(0)
  expect(submittedTexts).toHaveLength(0)
})

test('test_user_dispatch_json_true_overrides_default_false', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'], DISPATCH_OFF_TEXT, '{ "enablements": { "ask-dont-dump": { "turn.complete": true } } }')
  await executeTurnAndWait($)
  expect(modelCalls.count).toBe(3)
  expect(submittedTexts).toHaveLength(1)
})

test('test_reply_that_answers_the_nudge_is_skipped', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, ['yes', 'yes', 'yes'])
  await $.prompt.submit(NUDGE_REPLY)
  await executeTurnAndWait($)
  expect(modelCalls.count).toBe(0)
  expect(submittedTexts).toEqual(['nudge'])
})

// The engine skips a hook that throws, so a thrown error shows as no prompt submitted.
test('test_model_with_no_answer_makes_the_hook_throw_and_submits_no_prompt', async ($, on) => {
  const { submittedTexts, modelCalls } = setUpCheckerStubs(on, [], DISPATCH_TEXT, undefined, false)
  await executeTurnAndWait($)
  expect(modelCalls.count).toBeGreaterThan(0)
  expect(submittedTexts).toHaveLength(0)
})

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
