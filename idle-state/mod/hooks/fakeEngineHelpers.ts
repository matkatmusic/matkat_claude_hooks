import type { EngineInterface } from 'claude-code';
import { NO_PROCESS_FOUND } from './idleStateTestHelpers';

export function createFakeEngine(messages: unknown[]) {
  const fake = {
    nowMs: Date.parse('2026-10-15T10:00:00'),
    foundPids: '',
    written: [] as { path: string; text: string }[],
    timers: [] as { ms: number; run: () => unknown }[],
    commands: [] as string[],
    submitted: [] as string[],
    argvs: [] as string[][],
  };
  async function getNow() {
    return fake.nowMs;
  }
  function appendTimer(ms: number, run: () => unknown) {
    fake.timers.push({ ms, run });
    return { cancel() {} };
  }
  async function readTemplate() {
    return 'TEMPLATE';
  }
  async function appendWrite(path: string, text: string) {
    fake.written.push({ path, text });
  }
  async function appendSubmitted(arg: { text: string }) {
    fake.submitted.push(arg.text);
  }
  async function appendCommand(arg: { command: string }) {
    fake.commands.push(arg.command);
  }
  async function getMessages() {
    return messages;
  }
  async function getRoot() {
    return '/work/p';
  }
  async function getSessionId() {
    return 'abcdef1234567890';
  }
  async function getProcessResult(argv: string[]) {
    fake.argvs.push(argv);
    const isKeyPush = argv[0] === 'python3';
    if (isKeyPush)
      return { ...NO_PROCESS_FOUND, exitCode: 0 };
    if (fake.foundPids === '')
      return NO_PROCESS_FOUND;
    return { ...NO_PROCESS_FOUND, exitCode: 0, stdout: fake.foundPids };
  }
  const engine = {
    plugin: { root: '/plugin' },
    clock: { now: getNow, after: appendTimer },
    fs: { read: readTemplate, write: appendWrite },
    prompt: { submit: appendSubmitted },
    command: { run: appendCommand },
    session: { messages: getMessages, root: getRoot, id: getSessionId },
    process: { run: getProcessResult },
  } as unknown as EngineInterface;
  return { fake, engine };
}
