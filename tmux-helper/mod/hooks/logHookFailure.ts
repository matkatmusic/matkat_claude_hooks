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

const DISPATCHER_DIR_FOR_DEBUG = '../../dispatcher';

type DebugSettingsFile = { debugLoggingEnabled?: boolean };
type ModelRequest = Parameters<EngineInterface['model']['complete']>[0];
type ModelReply = Awaited<ReturnType<EngineInterface['model']['complete']>>;

async function isDebugLoggingEnabled($: EngineInterface): Promise<boolean> {
  const userPath = `${$.plugin.root}/${DISPATCHER_DIR_FOR_DEBUG}/user-dispatch.json`;
  const hasUserFile = await $.fs.exists(userPath);
  if (hasUserFile) {
    const user: DebugSettingsFile = JSON.parse(await $.fs.read(userPath));
    if (user.debugLoggingEnabled !== undefined)
      return user.debugLoggingEnabled;
  }
  const defaults: DebugSettingsFile = JSON.parse(await $.fs.read(`${$.plugin.root}/${DISPATCHER_DIR_FOR_DEBUG}/dispatch.json`));
  if (defaults.debugLoggingEnabled === undefined)
    throw new Error('dispatch.json has no debugLoggingEnabled');
  return defaults.debugLoggingEnabled;
}

async function appendDebugLine($: EngineInterface, hookName: string | undefined, event: string, kind: string, fields: Record<string, unknown>): Promise<void> {
  const root = await $.session.root();
  const sessionId = await $.session.id();
  const isoTime = new Date(await $.clock.now()).toISOString();
  const debugPath = `${root}/.claude_hooks/debug/${sessionId}.jsonl`;
  const line = JSON.stringify({ time: isoTime, source: $.plugin.name, hook: hookName, event, kind, ...fields });
  const result = await $.process.run(['sh', '-c', 'mkdir -p "$(dirname "$1")" && cat >> "$1"', 'sh', debugPath], { stdin: `${line}\n` });
  if (result.exitCode !== 0)
    throw new Error(`${$.plugin.name}: appending to ${debugPath} failed: ${result.stderr}`);
  await addIgnoreLineWhenGitExists($, root);
}

function wrapNextToCollectCalls<N extends (e: never) => Promise<unknown>>(next: N, passedToNext: unknown[]): N {
  return new Proxy(next, {
    apply(target, thisArg, args) {
      passedToNext.push(args[0]);
      return Reflect.apply(target, thisArg, args);
    },
    get(target, property) {
      return Reflect.get(target, property, target);
    },
  });
}

export async function wrapNextForDebugLog<N extends (e: never) => Promise<unknown>>($: EngineInterface, hookName: string, event: string, e: unknown, next: N): Promise<{ next: N; finish: (returned: unknown) => Promise<void> }> {
  const isLogging = await isDebugLoggingEnabled($);
  if (!isLogging)
    return { next, finish: async () => {} };
  await appendDebugLine($, hookName, event, 'hook.input', { input: e });
  const passedToNext: unknown[] = [];
  async function logHookOutput(returned: unknown): Promise<void> {
    await appendDebugLine($, hookName, event, 'hook.output', { passedToNext, returned });
  }
  return { next: wrapNextToCollectCalls(next, passedToNext), finish: logHookOutput };
}

export async function getModelReplyWithDebugLog($: EngineInterface, request: ModelRequest): Promise<ModelReply> {
  const isLogging = await isDebugLoggingEnabled($);
  if (!isLogging)
    return await $.model.complete(request);
  const callId = crypto.randomUUID();
  await appendDebugLine($, undefined, 'model.complete', 'model.request', { callId, request });
  const reply = await $.model.complete(request);
  await appendDebugLine($, undefined, 'model.complete', 'model.reply', { callId, reply });
  return reply;
}
