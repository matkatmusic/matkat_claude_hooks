import { test, expect, mock } from 'claude-code/testing'

const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const

test('context below the limit shows no message', async ($, on) => {
  // mock.env(on, { CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT: '30' })
  const toasts: string[] = []
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: 29, window: 200000 } } }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.turn.complete(ANSWER)
  expect(toasts).toEqual([])
})

test('context over the limit shows the message once', async ($, on) => {
  // mock.env(on, { CLAUDE_HOOKS_CONTEXT_EXIT_PERCENT: '30' })
  const toasts: string[] = []
  let percent = 31
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent, window: 200000 } } }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', (_$, e) => ({ text: e.answer }))

  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]).toContain('above 30%')
  percent = 32
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
})
