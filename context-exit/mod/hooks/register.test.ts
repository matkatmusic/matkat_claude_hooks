import { test, expect } from 'claude-code/testing'

const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const DEFAULT_TOAST_MS = 4000

function watchContext($: any, on: any, startPercent: number) {
  const toasts: { text: string; timeoutMs?: number }[] = []
  const context = { percent: startPercent }
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: context.percent, window: 200000 } } }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push({ text: e.text, timeoutMs: e.timeoutMs })
    return { value: undefined }
  })
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { toasts, context }
}

test('context below the limit shows no message', async ($, on) => {
  const { toasts } = watchContext($, on, 29)
  await $.turn.complete(ANSWER)
  expect(toasts).toEqual([])
})

test('context over the limit shows one message and no repeat at the same level', async ($, on) => {
  const { toasts, context } = watchContext($, on, 31)
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
  context.percent = 32
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
})

test('a higher level shows a new message once each', async ($, on) => {
  const { toasts, context } = watchContext($, on, 31)
  await $.turn.complete(ANSWER)
  context.percent = 55
  await $.turn.complete(ANSWER)
  context.percent = 60
  await $.turn.complete(ANSWER)
  context.percent = 85
  await $.turn.complete(ANSWER)
  context.percent = 90
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(3)
})

test('a jump straight to a high level shows one message', async ($, on) => {
  const { toasts } = watchContext($, on, 85)
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
})

test('the message stays on screen longer than the default', async ($, on) => {
  const { toasts } = watchContext($, on, 31)
  await $.turn.complete(ANSWER)
  expect(toasts[0]?.timeoutMs).toBeGreaterThan(DEFAULT_TOAST_MS)
})

test('a new session warns again at the first level', async ($, on) => {
  const { toasts } = watchContext($, on, 31)
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
})
