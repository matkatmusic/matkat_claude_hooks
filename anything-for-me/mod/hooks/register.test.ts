import { test, expect, mock } from 'claude-code/testing'

const PROMPT_TEXT = 'Is there anything for me to look at right now that would resolve or close some items on the task list, or provide the information needed for a pending task?'
const DISPATCH_ON = '{ "enablements": { "anything-for-me": { "session.start": true } } }'

test('a hook that throws is logged under .claude_hooks/logs and the failure still stands', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  on('fs.exists', () => ({ value: false }))
  on('session.start', (_$: any, e: any) => ({ cwd: e.cwd }))
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined } })
  on('session.root', () => ({ value: '/work/p' }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }))

  await $.session.start({ cwd: '/work/p', surface: null, isInteractive: false })
  expect(writes).toEqual([{ path: '/work/p/.claude_hooks/logs/2026-01-02/anything-for-me.log', text: '2026-01-02T03:04:05.000Z session=sess-9 event=session.start throw: no implementation for fs.read\n' }])
})

test('running the command submits the prompt as the user',async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  const submitted: { text: string; origin: any }[] = []
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: DISPATCH_ON }))
  on('prompt.submit', (_$: any, e: any) => {
    submitted.push({ text: e.text, origin: e.origin })
    return { text: e.text }
  })

  await $.command.run({ command: 'anything-for-me', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.settle()
  expect(submitted).toHaveLength(1)
  expect(submitted[0]?.text).toBe(PROMPT_TEXT)
  expect(submitted[0]?.origin).toEqual({ kind: 'plugin', name: 'anything-for-me', asUser: true })
})
