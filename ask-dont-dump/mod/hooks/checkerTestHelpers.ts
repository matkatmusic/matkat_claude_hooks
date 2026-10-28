export const ANSWER = { answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' } as const;
export const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
export const NUDGE_REPLY = { text: 'nudge', wait: false, origin: { kind: 'plugin', name: 'ask-dont-dump' } } as const;
export const KEYWORDS = ['question or choice', 'incomplete or unstarted', 'a bug report'];

export const DISPATCH_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": true, "turn.complete": true } } }';
export const DISPATCH_OFF_TEXT = '{ "enablements": { "ask-dont-dump": { "prompt.submit": false, "turn.complete": false } } }';
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

// answers are given in this order: question or choice, unfinished work, bug report
export function setUpCheckerStubs(on: any, answers: string[], dispatchText = DISPATCH_TEXT, userDispatchText?: string, isAnswered = true, settingsText = SETTINGS_TEXT) {
  const submittedTexts: string[] = [];
  const modelPrompts: string[] = [];
  const modelCalls = { count: 0 };
  on('session.root', () => ({ value: '/work/p' }));
  // on('env.get', () => ({ value: '/home/u' }));
  on('env.get', (_$: any, e: any) => {
    const isConfigDirName = e.name === 'CLAUDE_CONFIG_DIR';
    if (isConfigDirName)
      return { value: undefined };
    return { value: '/home/u' };
  });
  on('fs.list', () => ({ value: listTaskDirEntries() }));
  on('fs.exists', () => ({ value: userDispatchText !== undefined }));
  on('fs.read', (_$: any, e: any) => {
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
  });
  on('model.complete', (_$: any, e: any) => {
    modelCalls.count++;
    modelPrompts.push(e.prompt);
    if (!isAnswered)
      return { value: { isAnswered: false, reason: 'empty-reply' } };
    const text = answers[findKeywordIndex(e.prompt)] ?? 'no';
    return { value: { isAnswered: true, text, usage: USAGE } };
  });
  on('prompt.submit', (_$: any, e: any) => {
    submittedTexts.push(e.text);
    return { text: e.text };
  });
  on('turn.complete', (_$: any, e: any) => ({ text: e.answer }));
  return { submittedTexts, modelCalls, modelPrompts };
}

export async function executeTurnAndWait($: any, answer: string = ANSWER.answer) {
  await $.turn.complete({ ...ANSWER, answer });
  await new Promise(resolve => setTimeout(resolve, 0));
}
