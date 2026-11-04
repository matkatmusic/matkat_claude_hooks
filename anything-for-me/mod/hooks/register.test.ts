import { test, expect, mock } from 'claude-code/testing'

const PROMPT_TEXT = 'Is there anything for me to look at right now that would resolve or close some items on the task list, or provide the information needed for a pending task?'
const DISPATCH_ON = '{ "debugLoggingEnabled": false, "enablements": { "anything-for-me": { "session.start": true } } }'

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
  expect(submitted[0]?.origin).toEqual({ kind: 'plugin', name: 'anything-for-me', asUser: true })
})

const DISPATCH_ON_WITH_DEBUG = DISPATCH_ON.replace('"debugLoggingEnabled": false', '"debugLoggingEnabled": true')

function setUpDebugOutputRecording(on: any) {
  const events: string[] = []
  function recordProcessRun(_$: any, e: any) {
    const requestText = JSON.stringify(e)
    const isCommandHookOutputLine = requestText.includes('hook.output') && requestText.includes('sendPromptOnCommandRun')
    if (isCommandHookOutputLine)
      events.push('debug-output')
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  }
  function recordTimer() {
    events.push('clock.after')
    return { value: undefined }
  }
  function getNowValue() {
    return { value: Date.UTC(2026, 0, 2, 3, 4, 5) }
  }
  on('session.root', () => ({ value: '/work/p' }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('clock.now', getNowValue)
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: DISPATCH_ON_WITH_DEBUG }))
  on('fs.write', () => ({ value: undefined }))
  on('process.run', recordProcessRun)
  on('clock.after', recordTimer)
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  return events
}

async function waitForHooksToFinish() {
  await new Promise(resolve => setTimeout(resolve, 50))
}

async function assertDebugOutputLineIsWrittenBeforeTimerIsSet($: any, on: any) {
  // debug logging on: the hook.output debug line is written first, the timer is set after it
  const events = setUpDebugOutputRecording(on)

  await $.command.run({ command: 'anything-for-me', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await waitForHooksToFinish()
  expect(events).toEqual(['debug-output', 'clock.after'])
}

test('with debug logging on, the command writes the hook.output debug line before it sets the timer', assertDebugOutputLineIsWrittenBeforeTimerIsSet)
