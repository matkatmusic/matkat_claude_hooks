import { test, expect, mock } from 'claude-code/testing';

const NOTICE_TEMPLATE = 'helpers have been created.  use them for work instead of your own subagents:  {helperHandles}';
const EXPECTED_NOTICE = 'helpers have been created.  use them for work instead of your own subagents:  @X-helper-1, @X-helper-2';
const DISPATCH_ON = JSON.stringify({ debugLoggingEnabled: false, enablements: { 'tmux-helper': { 'prompt.submit': true } }, values: { 'claude-tmux': { CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE: NOTICE_TEMPLATE } } });
const DISPATCH_OFF = JSON.stringify({ debugLoggingEnabled: false, enablements: { 'tmux-helper': { 'prompt.submit': false } }, values: { 'claude-tmux': { CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE: NOTICE_TEMPLATE } } });
const SCRIPT_PATH_END = '/../../claude-tmux/individualSession/openHelperChats.ts';
const HELPER_SKILL_PROMPT = { text: '/matkat-hooks:tmux-new-helper 2', wait: false, origin: { kind: 'composer' }, command: { name: 'matkat-hooks:tmux-new-helper', args: '2' } } as const;
const OTHER_SKILL_PROMPT = { text: '/matkat-hooks:catch-up', wait: false, origin: { kind: 'composer' }, command: { name: 'matkat-hooks:catch-up', args: '' } } as const;

function setUpStubs(on: any, dispatchText: string, processResult: { exitCode: number; stdout: string; stderr: string }) {
  const seen = { argvs: [] as string[][], submitted: [] as string[] };
  function getNoUserFile() {
    return { value: false };
  }
  function readDispatchText() {
    return { value: dispatchText };
  }
  function runProcess(_$: any, e: any) {
    seen.argvs.push(e.argv);
    return { value: { ...processResult, isStdoutTruncated: false, isStderrTruncated: false } };
  }
  function collectSubmittedText(_$: any, e: any) {
    seen.submitted.push(e.text);
    return { text: e.text };
  }
  on('fs.exists', getNoUserFile);
  on('fs.read', readDispatchText);
  on('process.run', runProcess);
  on('prompt.submit', collectSubmittedText);
  return seen;
}

async function assertHelperSkillOpensChatsDropsPromptAndSendsNotice($: any, on: any) {
  // Scenario: the typed skill runs the open script, the skill prompt is dropped, and the main chat gets the notice.
  const clock = mock.clock(on, { now: 0 });
  const seen = setUpStubs(on, DISPATCH_ON, { exitCode: 0, stdout: '["X helper 1","X helper 2"]\n', stderr: '' });
  // the person types the skill with the argument 2
  const returned = await $.prompt.submit(HELPER_SKILL_PROMPT);
  // the open script runs once, with bun, the session title and the argument text
  expect(seen.argvs).toHaveLength(1);
  expect(seen.argvs[0]?.[0]).toBe('bun');
  expect(seen.argvs[0]?.[1]?.endsWith(SCRIPT_PATH_END)).toBe(true);
  expect(seen.argvs[0]?.slice(2)).toEqual(['', '2']);
  // the skill prompt is dropped before it reaches the model
  expect(returned.drop).toBeDefined();
  expect(seen.submitted).toEqual([]);
  // after the timer, the plugin sends the exact notice
  await clock.settle();
  expect(seen.submitted).toEqual([EXPECTED_NOTICE]);
}

async function assertOtherCommandPassesThroughWithoutRunningScript($: any, on: any) {
  // Scenario: a different command is left alone.
  const seen = setUpStubs(on, DISPATCH_ON, { exitCode: 0, stdout: '[]', stderr: '' });
  await $.prompt.submit(OTHER_SKILL_PROMPT);
  expect(seen.argvs).toEqual([]);
  expect(seen.submitted).toEqual([OTHER_SKILL_PROMPT.text]);
}

async function assertDisabledEventPassesThroughWithoutRunningScript($: any, on: any) {
  // Scenario: with prompt.submit off for tmux-helper, the skill prompt is left alone.
  const seen = setUpStubs(on, DISPATCH_OFF, { exitCode: 0, stdout: '[]', stderr: '' });
  await $.prompt.submit(HELPER_SKILL_PROMPT);
  expect(seen.argvs).toEqual([]);
  expect(seen.submitted).toEqual([HELPER_SKILL_PROMPT.text]);
}

async function assertNonZeroExitCodeThrowsWithStderr($: any, on: any) {
  // Scenario: the open script fails. The hook throws, and the engine log holds the stderr text.
  const writes: { path: string; text: string }[] = [];
  const seen = setUpStubs(on, DISPATCH_ON, { exitCode: 2, stdout: '', stderr: 'no tmux session' });
  on('fs.write', (_$: any, e: any) => { writes.push(e); return { value: undefined }; });
  on('session.root', () => ({ value: '/work/p' }));
  on('session.id', () => ({ value: 'sess-9' }));
  on('clock.now', () => ({ value: 0 }));
  await $.prompt.submit(HELPER_SKILL_PROMPT);
  expect(seen.argvs).toHaveLength(1);
  expect(writes).toHaveLength(1);
  expect(writes[0]?.text).toContain('event=prompt.submit throw: ');
  expect(writes[0]?.text).toContain('no tmux session');
}

test('test_helper_skill_opens_chats_drops_the_prompt_and_sends_the_notice', assertHelperSkillOpensChatsDropsPromptAndSendsNotice);
test('test_other_command_passes_through_without_running_the_script', assertOtherCommandPassesThroughWithoutRunningScript);
test('test_disabled_event_passes_through_without_running_the_script', assertDisabledEventPassesThroughWithoutRunningScript);
test('test_non_zero_exit_code_throws_with_the_stderr_text', assertNonZeroExitCodeThrowsWithStderr);
