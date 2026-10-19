import { test, expect, mock } from 'claude-code/testing'

const IDLE_MS = 3300000
const STATE_OBJECT = {
  work: ['built the idle-state mod'],
  done: ['tests pass; not committed'],
  not_done: ['live test'],
  files: ['hooks/register.ts'],
  runningPrograms: [
    { command: 'bun run server', purpose: 'serves the app' },
    { command: 'bun run watcher', purpose: 'watches files' },
  ],
  nextSteps: ['run it in a real chat'],
  traps: ['a Stop hook adds extra turns'],
}
const TEMPLATE_TEXT = '{ "work": ["what this chat worked on"] }'
const ANSWER = { answer: 'the state', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const DISPATCH_ALL_ON = '{ "enablements": { "idle-state": { "session.start": true, "session.end": true, "prompt.submit": true, "turn.complete": true, "tool.call": true, "command.run": true } } }'
const DISPATCH_ALL_OFF = '{ "enablements": { "idle-state": { "session.start": false, "session.end": false, "prompt.submit": false, "turn.complete": false, "tool.call": false, "command.run": false } } }'

function stubFs(on: any, dispatchText = DISPATCH_ALL_ON) {
  on('fs.exists', () => ({ value: false }))
  on('fs.read', (_$: any, e: any) => {
    const isDispatchFile = e.path.endsWith('dispatch.json')
    if (isDispatchFile)
      return { value: dispatchText }
    return { value: TEMPLATE_TEXT }
  })
}

test('idle chat writes a state file, exits, then drops prompts', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
  })
  const submitted: string[] = []
  const written: { path: string; text: string }[] = []
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', ($, e) => {
    written.push(e)
    return { value: undefined }
  })
  const commands: string[] = []
  on('command.run', ($, e) => {
    commands.push(e.command)
    return { text: '' }
  })
  stubFs(on)
  on('process.run', (_$, e) => {
    const isServer = e.argv[2] === 'bun run server'
    if (isServer)
      return { value: { exitCode: 0, stdout: '123\n456\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.messages', () => ({
    value: [
      { role: 'assistant', text: 'an old reply', toolUses: [] },
      { role: 'user', text: `The idle-state plugin sent a message:\n${submitted[0]}`, toolUses: [] },
      { role: 'assistant', text: JSON.stringify(STATE_OBJECT), toolUses: [] },
      { role: 'assistant', text: '', toolUses: [] },
      { role: 'assistant', text: 'I ran the turn-done script.', toolUses: [] },
    ],
  }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  await $.turn.complete(ANSWER)
  expect(submitted).toEqual([])
  await clock.advance(IDLE_MS)
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain(TEMPLATE_TEXT)

  await $.turn.complete({ ...ANSWER, answer: 'I ran the turn-done script.' })
  expect(written).toHaveLength(2)
  expect(written[0]).toEqual({ path: '/work/my-project/.idleState/.gitignore', text: '*\n' })
  const stateFile = written[1]
  expect(stateFile?.path).toMatch(/^\/work\/my-project\/\.idleState\/\d{4}-\d{2}-\d{2}-\d{4}-abcdef12\.json$/)
  expect(JSON.parse(stateFile?.text ?? '')).toEqual({
    ...STATE_OBJECT,
    runningPrograms: [
      { command: 'bun run server', purpose: 'serves the app', pids: [123, 456], isRunning: true },
      { command: 'bun run watcher', purpose: 'watches files', pids: [], isRunning: false },
    ],
  })
  expect(stateFile?.text).not.toContain('I ran the turn-done script.')
  expect(stateFile?.text).not.toContain('an old reply')
  await clock.settle()
  expect(commands).toEqual(['exit'])

  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } })
  expect(result.drop).toContain(stateFile?.path)
})

test('typing exit writes the state file first, then exits', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  const submitted: string[] = []
  const written: { path: string; text: string }[] = []
  const commands: string[] = []
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', ($, e) => {
    written.push(e)
    return { value: undefined }
  })
  on('command.run', ($, e) => {
    commands.push(e.command)
    return { text: '' }
  })
  stubFs(on)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: `The idle-state plugin sent a message:\n${submitted[0]}`, toolUses: [] },
      { role: 'assistant', text: JSON.stringify(STATE_OBJECT), toolUses: [] },
    ],
  }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  await $.command.run({ command: 'exit', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
  await clock.settle()
  expect(submitted).toHaveLength(1)
  expect(submitted[0]).toContain(TEMPLATE_TEXT)
  expect(commands).toEqual([])

  await $.turn.complete(ANSWER)
  await clock.settle()
  expect(written).toHaveLength(2)
  expect(written[1]?.path).toMatch(/^\/work\/my-project\/\.idleState\/\d{4}-\d{2}-\d{2}-\d{4}-abcdef12\.json$/)
  expect(commands).toEqual(['exit'])
})

test('aborted state turn writes no file and the next prompt is not dropped', async ($, on) => {
  // Idle chat sends the state prompt; an aborted turn writes no file, and the next prompt passes.
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
  })
  const written: { path: string; text: string }[] = []
  const commands: string[] = []
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', ($, e) => {
    written.push(e)
    return { value: undefined }
  })
  on('command.run', ($, e) => {
    commands.push(e.command)
    return { text: '' }
  })
  stubFs(on)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: JSON.stringify(STATE_OBJECT), toolUses: [] }] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.turn.complete({ ...ANSWER, isAborted: true })
  await clock.settle()
  expect(written).toEqual([])
  expect(commands).toEqual([])

  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } })
  expect(result.drop).toBeUndefined()
})

test('user typing after the state prompt writes no file and does not parse the reply', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
  })
  const submitted: string[] = []
  const written: { path: string; text: string }[] = []
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', ($, e) => {
    written.push(e)
    return { value: undefined }
  })
  on('command.run', () => ({ text: '' }))
  stubFs(on)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: `The idle-state plugin sent a message:\n${submitted[0]}`, toolUses: [] },
      { role: 'user', text: 'never mind, do this instead', toolUses: [] },
      { role: 'assistant', text: 'You are right. Here is the answer.', toolUses: [] },
    ],
  }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.turn.complete(ANSWER)
  await clock.settle()
  expect(written).toEqual([])
})

test('tools are denied while the state prompt is pending, then allowed again', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  let toolsRun = 0
  stubFs(on)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => {
    toolsRun++
    return { result: {}, text: 'ran' }
  })

  await $.turn.complete(ANSWER)
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(toolsRun).toBe(1)

  await clock.advance(IDLE_MS)
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(toolsRun).toBe(1)

  await $.turn.complete({ ...ANSWER, isAborted: true })
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(toolsRun).toBe(2)
})

test('a user prompt during the state turn lets tools run again', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  let toolsRun = 0
  stubFs(on)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('tool.call', () => {
    toolsRun++
    return { result: {}, text: 'ran' }
  })

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(toolsRun).toBe(0)

  await $.prompt.submit({ text: 'never mind, do this instead', wait: false, origin: { kind: 'composer' } })
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(toolsRun).toBe(1)
})

test('pgrep gets the program command with regex characters escaped', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  const patterns: string[] = []
  const state = { ...STATE_OBJECT, runningPrograms: [{ command: 'node server.js --port=(80)', purpose: 'serves' }] }
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', () => ({ value: undefined }))
  on('command.run', () => ({ text: '' }))
  stubFs(on)
  on('process.run', (_$, e) => {
    patterns.push(e.argv[2] ?? '')
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.messages', () => ({ value: [{ role: 'assistant', text: JSON.stringify(state), toolUses: [] }] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.turn.complete(ANSWER)
  await clock.settle()
  expect(patterns).toEqual(['node server\\.js --port=\\(80\\)'])
})

test('a reply wrapped in extra text writes no state file and does not exit', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  const wrappedReply = `Sure, here it is: ${JSON.stringify(STATE_OBJECT)} Hope that helps.`
  const written: { path: string; text: string }[] = []
  const commands: string[] = []
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', ($, e) => {
    written.push(e)
    return { value: undefined }
  })
  on('command.run', ($, e) => {
    commands.push(e.command)
    return { text: '' }
  })
  stubFs(on)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: wrappedReply, toolUses: [] }] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.turn.complete(ANSWER)
  await clock.settle()
  const writtenPaths: string[] = []
  for (const file of written)
    writtenPaths.push(file.path)
  expect(writtenPaths).toEqual(['/work/my-project/.idleState/.gitignore'])
  expect(commands).toEqual([])
})

test('all events disabled in dispatch.json: the idle timer never starts and tools run', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, { HOME: '/home/u' })
  const submitted: string[] = []
  let toolsRun = 0
  stubFs(on, DISPATCH_ALL_OFF)
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => {
    submitted.push(e.text)
    return { text: e.text }
  })
  on('tool.call', () => {
    toolsRun++
    return { result: {}, text: 'ran' }
  })

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.tool.call({ tool: 'Read', file_path: '/a.md' })
  expect(submitted).toEqual([])
  expect(toolsRun).toBe(1)
})

test('session end after a state write stops dropping prompts', async ($, on) => {
  // Idle chat writes the state file and exits; after the session ends, the next prompt passes.
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
  })
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', () => ({ value: undefined }))
  on('command.run', () => ({ text: '' }))
  stubFs(on)
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: JSON.stringify(STATE_OBJECT), toolUses: [] }] }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))

  await $.turn.complete(ANSWER)
  await clock.advance(IDLE_MS)
  await $.turn.complete(ANSWER)
  await clock.settle()
  const dropped = await $.prompt.submit({ text: 'before end', wait: false, origin: { kind: 'composer' } })
  expect(dropped.drop).toBeDefined()

  await $.session.end({ reason: 'resume', sessionId: 'abcdef1234567890', resume: { sessionId: 'abcdef1234567890' } } as never)
  const result = await $.prompt.submit({ text: 'hello again', wait: false, origin: { kind: 'composer' } })
  expect(result.drop).toBeUndefined()
})
