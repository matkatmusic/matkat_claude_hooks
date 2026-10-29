import type { EngineInterface, HookFailure } from 'claude-code';

const IGNORE_LINE = '.claude_hooks/';

async function readTextOrEmpty($: EngineInterface, path: string): Promise<string> {
  const fileExists = await $.fs.exists(path);
  if (!fileExists)
    return '';
  const text = await $.fs.read(path);
  return text;
}

async function addIgnoreLineWhenGitExists($: EngineInterface, root: string): Promise<void> {
  const hasGitFolder = await $.fs.exists(`${root}/.git`);
  if (!hasGitFolder)
    return;
  const ignorePath = `${root}/.gitignore`;
  const ignoreText = await readTextOrEmpty($, ignorePath);
  const hasIgnoreLine = ignoreText.split('\n').includes(IGNORE_LINE);
  if (hasIgnoreLine)
    return;
  const needsNewline = ignoreText !== '' && !ignoreText.endsWith('\n');
  const separator = needsNewline ? '\n' : '';
  await $.fs.write(ignorePath, `${ignoreText}${separator}${IGNORE_LINE}\n`);
}

export async function logHookFailure($: EngineInterface, hookName: string, event: string, failure: HookFailure): Promise<void> {
  const root = await $.session.root();
  const sessionId = await $.session.id();
  const isoTime = new Date(await $.clock.now()).toISOString();
  const logPath = `${root}/.claude_hooks/logs/${isoTime.slice(0, 10)}/${hookName}.log`;
  const oldText = await readTextOrEmpty($, logPath);
  const oneLineMessage = (failure.message ?? '').replaceAll('\n', ' ');
  await $.fs.write(logPath, `${oldText}${isoTime} session=${sessionId} event=${event} ${failure.kind}: ${oneLineMessage}\n`);
  await addIgnoreLineWhenGitExists($, root);
}

export async function logAndRethrowHookFailure($: EngineInterface, _e: unknown, next: { error: HookFailure; event: string }): Promise<never> {
  await logHookFailure($, $.plugin.name, next.event, next.error);
  throw new Error(next.error.message ?? `${$.plugin.name} ${next.event} hook ${next.error.kind}`);
}
