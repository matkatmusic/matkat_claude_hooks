import { test, expect } from 'claude-code/testing'

const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function setUpCheckerStubs(on: any, checkerReplyText: string) {
  const submittedTexts: string[] = []
  on('fs.read', () => ({ value: 'rubric: $ARGUMENTS' }))
  on('model.complete', () => ({ value: { isAnswered: true, text: checkerReplyText, usage: USAGE } }))
  on('prompt.submit', (_$: any, e: any) => {
    submittedTexts.push(e.text)
    return { text: e.text }
  })
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { submittedTexts }
}

test('test_reply_that_passes_submits_no_prompt', async ($, on) => {
  // Step 1: the checker stub says the reply is fine.
  const { submittedTexts } = setUpCheckerStubs(on, '{"ok": true}')
  // Step 2: a main-loop turn ends with a final answer.
  await $.turn.complete(ANSWER)
  // Step 3: no prompt went back to the model.
  expect(submittedTexts).toEqual([])
})

test('test_reply_that_fails_submits_the_reason', async ($, on) => {
  // Step 1: the checker stub says the reply has a loose end, with a reason.
  const { submittedTexts } = setUpCheckerStubs(on, '{"ok": false, "reason": "R"}')
  // Step 2: a main-loop turn ends with a final answer.
  await $.turn.complete(ANSWER)
  // Step 3: exactly one prompt went back to the model, and it holds the reason.
  expect(submittedTexts).toEqual(['R'])
})
