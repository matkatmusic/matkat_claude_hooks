import { test, expect, mock } from 'claude-code/testing'

const PROMPT_TEXT = 'Is there anything for me to look at right now that would resolve or close some items on the task list, or provide the information needed for a pending task?'
const DISPATCH_ON = '{ "enablements": { "anything-for-me": { "session.start": true } } }'

test('running the command submits the prompt as the user', async ($, on) => {
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
