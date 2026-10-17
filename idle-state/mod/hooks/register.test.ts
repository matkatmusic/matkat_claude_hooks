import { test, expect, mock } from 'claude-code/testing'

// const IDLE_MS = 2 * 60 * 1000
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

test('idle chat writes a state file, exits, then drops prompts', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
    // CLAUDE_HOOKS_IDLE_STATE_IDLE_MS: '60000',
    // CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS: '180000',
    // CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS: '1000',
    // CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME: '.idleState',
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
  on('fs.read', () => ({ value: TEMPLATE_TEXT }))
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
  // expect(submitted[0]).toContain('Reply with only a JSON object')
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
  // expect(result.drop).toBe(`The chat cache has expired. You should exit this chat. Start a new chat. The SessionStart hook will automatically read ${stateFile?.path}`)
  expect(result.drop).toContain(stateFile?.path)
})

test('aborted state turn writes no file and the next prompt is not dropped', async ($, on) => {
  // Idle chat sends the state prompt; an aborted turn writes no file, and the next prompt passes.
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
    // CLAUDE_HOOKS_IDLE_STATE_IDLE_MS: '60000',
    // CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS: '180000',
    // CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS: '1000',
    // CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME: '.idleState',
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
  on('fs.read', () => ({ value: TEMPLATE_TEXT }))
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
    // CLAUDE_HOOKS_IDLE_STATE_IDLE_MS: '60000',
    // CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS: '180000',
    // CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS: '1000',
    // CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME: '.idleState',
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
  on('fs.read', () => ({ value: TEMPLATE_TEXT }))
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

test('session end after a state write stops dropping prompts', async ($, on) => {
  // Idle chat writes the state file and exits; after the session ends, the next prompt passes.
  const clock = mock.clock(on, { now: Date.parse('2026-10-15T10:00:00') })
  mock.env(on, {
    HOME: '/home/u',
    // CLAUDE_HOOKS_IDLE_STATE_IDLE_MS: '60000',
    // CLAUDE_HOOKS_IDLE_STATE_LATE_LIMIT_MS: '180000',
    // CLAUDE_HOOKS_IDLE_STATE_EXIT_KEY_DELAY_MS: '1000',
    // CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME: '.idleState',
  })
  on('session.root', () => ({ value: '/work/my-project' }))
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('fs.write', () => ({ value: undefined }))
  on('command.run', () => ({ text: '' }))
  on('fs.read', () => ({ value: TEMPLATE_TEXT }))
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
