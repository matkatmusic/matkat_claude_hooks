export const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const;
export const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
export const NUDGE_REPLY = { text: 'nudge', wait: false, origin: { kind: 'plugin', name: 'ask-dont-dump' } } as const;
// export const KEYWORDS = ['question or choice', 'incomplete or unstarted', 'a bug report', 'a claim about the repo state'];
export const KEYWORDS = ['question or choice', 'work is not finished/started', 'a bug report', 'statement of fact about the git repository', 'a named task (e.g. #12)', 'functionality that is missing from the codebase'];

export const DISPATCH_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": true, "turn.complete": true, "session.end": true } } }';
export const DISPATCH_OFF_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": false, "turn.complete": false, "session.end": false } } }';
export const SETTINGS_TEXT = '{ "env": { "CLAUDE_CODE_TASK_LIST_ID": "proj" } }';
export const OPEN_SUBJECT = 'Commit the prompt-intent change';
export const IN_PROGRESS_SUBJECT = 'Write the retry helper';
export const COMPLETED_SUBJECT = 'Fix the old viewer bug';
const TASK_FILES: Record<string, string> = {
  '290.json': JSON.stringify({ id: '290', subject: OPEN_SUBJECT, status: 'pending' }),
  '291.json': JSON.stringify({ id: '291', subject: COMPLETED_SUBJECT, status: 'completed' }),
  '292.json': JSON.stringify({ id: '292', subject: IN_PROGRESS_SUBJECT, status: 'in_progress' }),
};
const TASK_DIR_NAMES = ['290.json', '291.json', '292.json', '.lock'];

export function findKeywordIndex(prompt: string): number {
  for (const [i, keyword] of KEYWORDS.entries()) {
    const hasKeyword = prompt.includes(keyword);
    if (hasKeyword)
      return i;
  }
  return -1;
}

function listTaskDirEntries() {
  const entries = [];
  for (const name of TASK_DIR_NAMES)
    entries.push({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false });
  return entries;
}

export const NUDGE_PATH = '/work/p/.claude_hooks/ask-dont-dump/sess-9.json';
const MESSAGE_MARKER = 'The message:\n';
const SENTENCE_NOT_IN_REPLY = 'A sentence the reply never wrote.';

function formatStubAnswer(answerKind: string, prompt: string): string {
  if (answerKind === 'yes')
    return `yes: "${prompt.split(MESSAGE_MARKER).pop()}"`;
  if (answerKind === 'yes-sentence-not-in-reply')
    return `yes: "${SENTENCE_NOT_IN_REPLY}"`;
  return answerKind;
}

export function readNudgeFile(fileWrites: { path: string; text: string }[]) {
  let nudgeText: string | undefined;
  for (const write of fileWrites) {
    if (write.path === NUDGE_PATH)
      nudgeText = write.text;
  }
  if (nudgeText === undefined)
    throw new Error('the nudge file was not written');
  return JSON.parse(nudgeText) as { did: string; do: string; proof: string }[];
}

// answers ('yes', 'yes-sentence-not-in-reply', 'no') in order: question or choice, unfinished work, bug, repo state, task, missing feature
export function setUpCheckerStubs(on: any, answers: string[], dispatchText = DISPATCH_TEXT, userDispatchText?: string, isAnswered = true, settingsText = SETTINGS_TEXT, existingFiles: string[] = []) {
  const submittedTexts: string[] = [];
  const modelPrompts: string[] = [];
  const fileWrites: { path: string; text: string }[] = [];
  const processCalls: string[][] = [];
  const modelCalls = { count: 0 };
  function getWorkRoot() {
    return { value: '/work/p' };
  }
  function getSessionId() {
    return { value: 'sess-9' };
  }
  function appendFileWrite(_$: any, e: any) {
    fileWrites.push({ path: e.path, text: e.text });
    return { value: undefined };
  }
  function appendProcessCall(_$: any, e: any) {
    processCalls.push(e.argv);
    return { value: { exitCode: 0, stdout: '', stderr: '' } };
  }
  function getEnvValue(_$: any, e: any) {
    const isConfigDirName = e.name === 'CLAUDE_CONFIG_DIR';
    if (isConfigDirName)
      return { value: undefined };
    return { value: '/home/u' };
  }
  function listTaskDirectory() {
    return { value: listTaskDirEntries() };
  }
  function getFileExists(_$: any, e: any) {
    const isUserDispatchFile = e.path.endsWith('user-dispatch.json');
    if (isUserDispatchFile)
      return { value: userDispatchText !== undefined };
    return { value: existingFiles.includes(e.path) };
  }
  function readFileText(_$: any, e: any) {
    const isUserDispatchFile = e.path.endsWith('user-dispatch.json');
    if (isUserDispatchFile)
      return { value: userDispatchText };
    const isSettingsFile = e.path.endsWith('/.claude/settings.json');
    if (isSettingsFile)
      return { value: settingsText };
    const isTaskFile = e.path.startsWith('/home/u/.claude/tasks/proj/');
    if (isTaskFile)
      return { value: TASK_FILES[e.path.split('/').pop()] };
    return { value: dispatchText };
  }
  function getModelReply(_$: any, e: any) {
    modelCalls.count++;
    modelPrompts.push(e.prompt);
    if (!isAnswered)
      return { value: { isAnswered: false, reason: 'empty-reply' } };
    const answerKind = answers[findKeywordIndex(e.prompt)] ?? 'no';
    const text = formatStubAnswer(answerKind, e.prompt);
    return { value: { isAnswered: true, text, usage: USAGE } };
  }
  function appendSubmittedText(_$: any, e: any) {
    submittedTexts.push(e.text);
    return { text: e.text };
  }
  function getTurnText(_$: any, e: any) {
    return { text: e.answer };
  }
  on('session.root', getWorkRoot);
  on('session.id', getSessionId);
  on('fs.write', appendFileWrite);
  on('process.run', appendProcessCall);
  on('env.get', getEnvValue);
  on('fs.list', listTaskDirectory);
  on('fs.exists', getFileExists);
  on('fs.read', readFileText);
  on('model.complete', getModelReply);
  on('prompt.submit', appendSubmittedText);
  on('turn.complete', getTurnText);
  return { submittedTexts, modelCalls, modelPrompts, fileWrites, processCalls };
}

export async function executeTurnAndWait($: any, answer: string = ANSWER.answer) {
  await $.turn.complete({ ...ANSWER, answer });
  await new Promise(resolve => setTimeout(resolve, 0));
}
