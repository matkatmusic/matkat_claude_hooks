import { test, expect } from 'claude-code/testing'
import { isSwapDue, getSwapMode } from './register'

// const SWAP_DUE_INPUT = { teamName: 'team a', percent: 35, swapPercent: 30, backgroundTaskCount: 0, isSwapStarted: false }
const SWAP_DUE_INPUT = { swapMode: 'team', percent: 35, swapPercent: 30, backgroundTaskCount: 0, isSwapStarted: false } as const

// test('isSwapDue is false with no team name', () => {
//   expect(isSwapDue({ ...SWAP_DUE_INPUT, teamName: undefined })).toBe(false)
// })
test('isSwapDue is false with no swap mode', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, swapMode: undefined })).toBe(false)
})

test('isSwapDue is false when the percent is undefined', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, percent: undefined })).toBe(false)
})

test('isSwapDue is false when the percent is below the swap percent', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, percent: 29 })).toBe(false)
})

test('isSwapDue is true when the percent equals the swap percent', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, percent: 30 })).toBe(true)
})

test('isSwapDue is false with one background task', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, backgroundTaskCount: 1 })).toBe(false)
})

test('isSwapDue is false when the swap already started', () => {
  expect(isSwapDue({ ...SWAP_DUE_INPUT, isSwapStarted: true })).toBe(false)
})

test('isSwapDue is true when all conditions are met', () => {
  expect(isSwapDue(SWAP_DUE_INPUT)).toBe(true)
})

const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const
const DEFAULT_TOAST_MS = 4000

const DISPATCH_WITH_PERCENTS = '{ "debugLoggingEnabled": false, "enablements": { "context-exit": { "turn.complete": true } }, "values": { "context-exit": { "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS": "30,50,80" } } }'

function watchContext($: any, on: any, startPercent: number, dispatchText = DISPATCH_WITH_PERCENTS, userText?: string) {
  const toasts: { text: string; timeoutMs?: number }[] = []
  const context = { percent: startPercent }
  on('fs.exists', () => ({ value: userText !== undefined }))
  on('fs.read', (_$: any, e: any) => {
    const isUserFile = e.path.endsWith('user-dispatch.json')
    if (isUserFile)
      return { value: userText }
    return { value: dispatchText }
  })
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: context.percent, window: 200000 } } }))
  on('ui.toast', (_$: any, e: any) => {
    toasts.push({ text: e.text, timeoutMs: e.timeoutMs })
    return { value: undefined }
  })
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))
  return { toasts, context }
}

function watchStopHooksOffMarker(on: any) {
  const markerWrites: string[] = []
  const removeCommands: string[][] = []
  on('session.id', () => ({ value: 'sess-9' }))
  on('env.get', () => ({ value: undefined }))
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  on('fs.write', (_$: any, e: any) => { markerWrites.push(e.path); return { value: undefined } })
  on('process.run', (_$: any, e: any) => {
    removeCommands.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { markerWrites, removeCommands }
}

const DISPATCH_WITH_SWAP = '{ "debugLoggingEnabled": false, "enablements": { "context-exit": { "turn.complete": true, "classic.Stop": true } }, "values": { "context-exit": { "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS": "30,50,80", "CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT": "30" } } }'
const STOP_EVENT = { stop_hook_active: false, transcript_path: '/logs/chat.jsonl' } as const

function watchSwap($: any, on: any, teamName: string | undefined) {
  const swapCommands: string[][] = []
  on('classic.Stop', () => ({}))
  on('fs.exists', () => ({ value: false }))
  on('fs.read', () => ({ value: DISPATCH_WITH_SWAP }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: 35, window: 200000 } } }))
  on('env.get', (_$: any, e: any) => {
    if (teamName === undefined)
      return { value: undefined }
    const values: Record<string, string> = { CLAUDE_TEAM_NAME: teamName, CLAUDE_TEAM_JOB: 'orchestrator', CLAUDE_TEAM_CHAT_NAME: `${teamName} orchestrator 1` }
    return { value: values[e.name] }
  })
  on('process.run', (_$: any, e: any) => {
    swapCommands.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { swapCommands }
}

function watchSwapWithFailedMarker($: any, on: any, teamName: string) {
  const runCommands: string[][] = []
  const swapFailedMarker = { exists: false }
  on('classic.Stop', () => ({}))
  on('fs.exists', (_$: any, e: any) => {
    if (e.path.includes('/swap-failed/'))
      return { value: swapFailedMarker.exists }
    return { value: false }
  })
  on('fs.read', () => ({ value: DISPATCH_WITH_SWAP }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: 35, window: 200000 } } }))
  on('env.get', (_$: any, e: any) => {
    const values: Record<string, string> = { CLAUDE_TEAM_NAME: teamName, CLAUDE_TEAM_JOB: 'orchestrator', CLAUDE_TEAM_CHAT_NAME: `${teamName} orchestrator 1` }
    return { value: values[e.name] }
  })
  on('process.run', (_$: any, e: any) => {
    runCommands.push(e.argv)
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return { runCommands, swapFailedMarker }
}

test('a Stop above the swap percent in a team chat starts the swap script once', async ($, on) => {
  const { swapCommands } = watchSwap($, on, 'team a')
  await $.classic.Stop(STOP_EVENT)
  expect(swapCommands).toHaveLength(1)
  expect(swapCommands[0]!.slice(0, 3)).toEqual(['tmux', 'run-shell', '-b'])
  expect(swapCommands[0]![3]).toContain('swapChat.ts')
  expect(swapCommands[0]![3]).toContain('team a orchestrator 1')
})

test('the swap command passes the session id as the fourth argument of swapFailed.ts', async ($, on) => {
  const { swapCommands } = watchSwap($, on, 'team a')
  await $.classic.Stop(STOP_EVENT)
  expect(swapCommands[0]![3]).toContain("swapFailed.ts 'team a' 'orchestrator' 'team a orchestrator 1' 'sess-9'")
})

test('a second Stop above the swap percent starts no second swap', async ($, on) => {
  const { swapCommands } = watchSwap($, on, 'team a')
  await $.classic.Stop(STOP_EVENT)
  await $.classic.Stop(STOP_EVENT)
  expect(swapCommands).toHaveLength(1)
})

test('a Stop after a failed swap starts the swap script again', async ($, on) => {
  const { runCommands, swapFailedMarker } = watchSwapWithFailedMarker($, on, 'team a')
  await $.classic.Stop(STOP_EVENT)
  const swapCommands = () => runCommands.filter(command => command[0] === 'tmux')
  expect(swapCommands()).toHaveLength(1)
  swapFailedMarker.exists = true
  await $.classic.Stop(STOP_EVENT)
  expect(swapCommands()).toHaveLength(2)
})

test('a Stop after a failed swap removes the swap-failed marker', async ($, on) => {
  const { runCommands, swapFailedMarker } = watchSwapWithFailedMarker($, on, 'team a')
  await $.classic.Stop(STOP_EVENT)
  swapFailedMarker.exists = true
  await $.classic.Stop(STOP_EVENT)
  const removeCommands = runCommands.filter(command => command[0] === 'rm')
  expect(removeCommands).toHaveLength(1)
  expect(removeCommands[0]![1]).toContain('/swap-failed/')
  expect(removeCommands[0]![1]!.endsWith('/swap-failed/sess-9')).toBe(true)
})

test('a Stop with no team name starts no swap', async ($, on) => {
  const { swapCommands } = watchSwap($, on, undefined)
  await $.classic.Stop(STOP_EVENT)
  expect(swapCommands).toEqual([])
})

async function submitPrompt($: any, text: string) {
  await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
}

test('a /handoff-state prompt writes the stop-hooks-off marker and turn.complete removes it', async ($, on) => {
  watchContext($, on, 10)
  const { markerWrites, removeCommands } = watchStopHooksOffMarker(on)
  await submitPrompt($, '/handoff-state')
  expect(markerWrites).toHaveLength(1)
  expect(markerWrites[0]!.endsWith('/dispatcher/stop-hooks-off/sess-9')).toBe(true)
  expect(removeCommands).toEqual([])
  await $.turn.complete(ANSWER)
  expect(removeCommands).toHaveLength(1)
  expect(removeCommands[0]!.slice(0, 2)).toEqual(['rm', '-f'])
  expect(removeCommands[0]![2]!.endsWith('/dispatcher/stop-hooks-off/sess-9')).toBe(true)
})

test('a /matkat-hooks:handoff-state prompt writes the stop-hooks-off marker', async ($, on) => {
  watchContext($, on, 10)
  const { markerWrites } = watchStopHooksOffMarker(on)
  await submitPrompt($, '/matkat-hooks:handoff-state')
  expect(markerWrites).toHaveLength(1)
})

test('a normal prompt writes no marker and its turn.complete removes none', async ($, on) => {
  watchContext($, on, 10)
  const { markerWrites, removeCommands } = watchStopHooksOffMarker(on)
  await submitPrompt($, 'fix the bug')
  await $.turn.complete(ANSWER)
  expect(markerWrites).toEqual([])
  expect(removeCommands).toEqual([])
})

test('a hook that throws is logged under .claude_hooks/logs and the failure still stands', async ($, on) => {
  const writes: { path: string; text: string }[] = []
  on('fs.exists', () => ({ value: false }))
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined } })
  on('session.root', () => ({ value: '/work/p' }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }))
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }))

  await $.turn.complete(ANSWER)
  expect(writes).toEqual([{ path: '/work/p/.claude_hooks/logs/2026-01-02/context-exit.log', text: '2026-01-02T03:04:05.000Z session=sess-9 event=turn.complete throw: no implementation for fs.read\n' }])
})

test('context below the limit shows no message',async ($, on) => {
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

test('turn.complete disabled in dispatch.json shows no message', async ($, on) => {
  const { toasts } = watchContext($, on, 85, '{ "debugLoggingEnabled": false, "enablements": { "context-exit": { "turn.complete": false } } }')
  await $.turn.complete(ANSWER)
  expect(toasts).toEqual([])
})

test('percents in user-dispatch.json win over dispatch.json', async ($, on) => {
  const userText = '{ "enablements": {}, "values": { "context-exit": { "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS": "10,20" } } }'
  const { toasts } = watchContext($, on, 12, DISPATCH_WITH_PERCENTS, userText)
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
  expect(toasts[0]?.text).toContain('above 10%')
})

test('dispatch.json without the percents value shows no message', async ($, on) => {
  const { toasts } = watchContext($, on, 31, '{ "debugLoggingEnabled": false, "enablements": { "context-exit": { "turn.complete": true } }, "values": {} }')
  await $.turn.complete(ANSWER)
  expect(toasts).toEqual([])
})

test('a new session warns again at the first level', async ($, on) => {
  const { toasts } = watchContext($, on, 31)
  await $.turn.complete(ANSWER)
  expect(toasts).toHaveLength(1)
})

const SINGLE_CHAT_SWAP_TOAST_TEXT = 'single chat swap toast text'
const SINGLE_CHAT_PROMPT_DROP_REASON_TEXT = 'single chat prompt drop reason text'
const DISPATCH_WITH_SINGLE_CHAT_SWAP = '{ "debugLoggingEnabled": false, "enablements": { "context-exit": { "turn.complete": true, "classic.Stop": true } }, "values": { "context-exit": { "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS": "30,50,80", "CLAUDE_HOOKS_CONTEXT_EXIT_SWAP_PERCENT": "30", "CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_SWAP_TOAST": "' + SINGLE_CHAT_SWAP_TOAST_TEXT + '", "CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_PROMPT_DROP_REASON": "' + SINGLE_CHAT_PROMPT_DROP_REASON_TEXT + '" } } }'
const SINGLE_CHAT_ENVIRONMENT: Record<string, string> = { CLAUDE_TMUX_NAME: 'bed', CLAUDE_TMUX_CHAT_NUMBER: '1', CLAUDE_TMUX_MODEL: 'haiku', CLAUDE_TMUX_WORK_DIRECTORY: '/work/bed', TMUX_PANE: '%7' }

function watchSingleChatSwap($: any, on: any, environmentValues: Record<string, string>, runShellExitCode: number) {
  const runCommands: string[][] = []
  const toasts: string[] = []
  const submittedTexts: string[] = []
  const swapFailedMarker = { exists: false }
  on('classic.Stop', () => ({}))
  on('fs.exists', (_$: any, e: any) => {
    if (e.path.includes('/swap-failed/'))
      return { value: swapFailedMarker.exists }
    return { value: false }
  })
  on('fs.read', () => ({ value: DISPATCH_WITH_SINGLE_CHAT_SWAP }))
  on('fs.write', () => ({ value: undefined }))
  on('session.id', () => ({ value: 'sess-9' }))
  on('session.root', () => ({ value: '/work/p' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 0, 2, 3, 4, 5) }))
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { percent: 35, window: 200000 } } }))
  on('env.get', (_$: any, e: any) => ({ value: environmentValues[e.name] }))
  on('process.run', (_$: any, e: any) => {
    runCommands.push(e.argv)
    const exitCode = e.argv[0] === 'tmux' ? runShellExitCode : 0
    return { value: { exitCode, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', (_$: any, e: any) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_$: any, e: any) => {
    submittedTexts.push(e.text)
    return { text: e.text }
  })
  return { runCommands, toasts, submittedTexts, swapFailedMarker }
}

async function submitPromptForResult($: any, text: string) {
  return await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
}

test('test_getSwapMode_returns_team_when_the_team_name_is_set', () => {
  expect(getSwapMode('team a', 'bed')).toBe('team')
})

test('test_getSwapMode_returns_single_when_only_the_claude_tmux_name_is_set', () => {
  expect(getSwapMode(undefined, 'bed')).toBe('single')
})

test('test_getSwapMode_returns_undefined_without_both_names', () => {
  expect(getSwapMode(undefined, undefined)).toBe(undefined)
})

test('test_a_Stop_above_the_swap_percent_in_a_claude_tmux_chat_starts_swapSingleChat_with_six_arguments', async ($, on) => {
  const { runCommands } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  const tmuxCommands = runCommands.filter(command => command[0] === 'tmux')
  expect(tmuxCommands).toHaveLength(1)
  expect(tmuxCommands[0]!.slice(0, 3)).toEqual(['tmux', 'run-shell', '-b'])
  expect(tmuxCommands[0]![3]).toContain("claude-tmux/swapSingleChat.ts 'bed' '1' 'haiku' '/work/bed' '%7' 'sess-9'")
})

test('test_the_single_chat_swap_command_runs_swapSingleChatFailed_with_the_same_arguments', async ($, on) => {
  const { runCommands } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  const tmuxCommands = runCommands.filter(command => command[0] === 'tmux')
  expect(tmuxCommands[0]![3]).toContain('|| bun')
  expect(tmuxCommands[0]![3]).toContain("swapSingleChatFailed.ts 'bed' '1' 'haiku' '/work/bed' '%7' 'sess-9'")
})

test('test_a_Stop_above_the_swap_percent_in_a_claude_tmux_chat_shows_the_swap_toast', async ($, on) => {
  const { toasts } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  expect(toasts).toEqual([SINGLE_CHAT_SWAP_TOAST_TEXT])
})

test('test_a_failed_run_shell_in_a_claude_tmux_chat_lets_the_next_Stop_try_again', async ($, on) => {
  const { runCommands } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 1)
  await $.classic.Stop(STOP_EVENT)
  await $.classic.Stop(STOP_EVENT)
  const tmuxCommands = runCommands.filter(command => command[0] === 'tmux')
  expect(tmuxCommands).toHaveLength(2)
})

test('test_a_Stop_in_a_claude_tmux_chat_without_a_pane_value_starts_no_swap', async ($, on) => {
  const { TMUX_PANE: _unusedPane, ...environmentWithoutPane } = SINGLE_CHAT_ENVIRONMENT
  const { runCommands } = watchSingleChatSwap($, on, environmentWithoutPane, 0)
  await $.classic.Stop(STOP_EVENT)
  const tmuxCommands = runCommands.filter(command => command[0] === 'tmux')
  expect(tmuxCommands).toHaveLength(0)
})

test('test_a_user_prompt_after_the_swap_started_in_a_claude_tmux_chat_is_dropped', async ($, on) => {
  const { submittedTexts } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  const result = await submitPromptForResult($, 'fix the bug')
  expect(result.drop).toBe(SINGLE_CHAT_PROMPT_DROP_REASON_TEXT)
  expect(submittedTexts).toEqual([])
})

test('test_a_slash_command_after_the_swap_started_in_a_claude_tmux_chat_passes', async ($, on) => {
  watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  const result = await submitPromptForResult($, '/exit')
  expect(result.drop).toBe(undefined)
})

test('test_a_user_prompt_after_a_failed_swap_in_a_claude_tmux_chat_passes', async ($, on) => {
  const { swapFailedMarker } = watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  await $.classic.Stop(STOP_EVENT)
  swapFailedMarker.exists = true
  const result = await submitPromptForResult($, '[claude-tmux] The swap failed')
  expect(result.drop).toBe(undefined)
})

test('test_a_user_prompt_before_the_swap_starts_in_a_claude_tmux_chat_passes', async ($, on) => {
  watchSingleChatSwap($, on, SINGLE_CHAT_ENVIRONMENT, 0)
  const result = await submitPromptForResult($, 'fix the bug')
  expect(result.drop).toBe(undefined)
})

test('test_a_user_prompt_after_the_swap_started_in_a_team_chat_passes',async ($, on) => {
  watchSwap($, on, 'team a')
  on('prompt.submit', (_$: any, e: any) => ({ text: e.text }))
  await $.classic.Stop(STOP_EVENT)
  const result = await submitPromptForResult($, 'fix the bug')
  expect(result.drop).toBe(undefined)
})
