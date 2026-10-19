// Disabled fake-engine rows 41 and 42: live rows 43 to 46 replace them.
/*
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { type DirectContext, type DirectResult, buildResult, formatFlag } from "./stranger_direct_support.ts";

const ANSWER = { answer: "done", isAborted: false };
const NOW = Date.parse("2026-10-15T10:00:00");

function wrapEvent(event: any): any {
  return { passed: event };
}

async function loadHooks(modulePath: string): Promise<Record<string, any>> {
  const loaded = await import(pathToFileURL(modulePath).href);
  const hooks: Record<string, any> = {};
  function registerHook(event: string, second: any, third?: any): void {
    hooks[event] = third ?? second;
  }
  loaded.register(registerHook);
  return hooks;
}

function createContextExitEngine(toasts: any[], statuses: string[], percentRef: { percent: number }): any {
  const store: Record<string, number> = {};
  async function readUsage() {
    return { context: { percent: percentRef.percent } };
  }
  async function getState(ref: any) {
    return { value: store[ref.key] };
  }
  async function setState(ref: any, value: number) {
    store[ref.key] = value;
  }
  function printToast(text: string, options: any) {
    toasts.push({ text, timeoutMs: options.timeoutMs });
  }
  function printStatus(text: string) {
    statuses.push(text);
  }
  return { session: { usage: readUsage }, state: { get: getState, set: setState }, ui: { toast: printToast, status: printStatus } };
}

export async function validateContextExitMod(context: DirectContext): Promise<DirectResult> {
  const hooks = await loadHooks(path.join(context.clone, "context-exit", "mod", "hooks", "register.ts"));
  const toasts: any[] = [];
  const statuses: string[] = [];
  const percentRef = { percent: 0 };
  const engine = createContextExitEngine(toasts, statuses, percentRef);
  for (const nextPercent of [29, 31, 32, 55, 85, 90]) {
    percentRef.percent = nextPercent;
    await hooks["turn.complete"](engine, ANSWER, wrapEvent);
  }
  const levels: string[] = [];
  for (const toast of toasts)
    levels.push(toast.text.slice(toast.text.indexOf("above "), toast.text.indexOf("%") + 1));
  const warnsEachLevel = levels.join(",") === "above 30%,above 50%,above 80%";
  const staysLong = toasts[0].timeoutMs >= 30000;
  const keepsStatus = statuses.length === 3;
  const ok = warnsEachLevel && staysLong && keepsStatus;
  return buildResult(41, "context-exit (mod)", ok, `toasts at 29,31,32,55,85,90 percent: ${levels.join(",")}; toast stays ${toasts[0].timeoutMs} ms: ${formatFlag(staysLong)}; status line repeats the message: ${formatFlag(keepsStatus)}`);
}

function createIdleEngine(context: DirectContext, replyRef: { text: string }) {
  const calls = { timers: [] as any[], pgrepArgs: [] as string[] };
  const messages: any[] = [];
  async function readTemplate(file: string) {
    return readFileSync(file, "utf8");
  }
  async function writeNothing() {
    return undefined;
  }
  async function sendPrompt(options: any) {
    messages.length = 0;
    messages.push({ role: "user", text: options.text }, { role: "assistant", text: replyRef.text });
  }
  async function getNow() {
    return NOW;
  }
  function scheduleTimer(_ms: number, callback: any) {
    calls.timers.push(callback);
    return { cancel: () => undefined };
  }
  async function getRoot() {
    return "/work/project";
  }
  async function getSessionId() {
    return "abcdef1234567890";
  }
  async function getMessages() {
    return messages;
  }
  async function executePgrep(argv: string[]) {
    calls.pgrepArgs.push(argv[2]);
    return { exitCode: 1, stdout: "", stderr: "" };
  }
  async function executeExit() {
    return undefined;
  }
  const engine: any = {
    plugin: { root: path.join(context.clone, "idle-state", "mod") },
    fs: { read: readTemplate, write: writeNothing },
    prompt: { submit: sendPrompt },
    clock: { now: getNow, after: scheduleTimer },
    session: { root: getRoot, id: getSessionId, messages: getMessages },
    process: { run: executePgrep },
    command: { run: executeExit },
  };
  return { engine, calls };
}

async function executeStateTurn(hooks: Record<string, any>, engine: any, calls: any): Promise<void> {
  await hooks["session.start"](engine, {}, wrapEvent);
  await hooks["turn.complete"](engine, ANSWER, wrapEvent);
  await calls.timers[calls.timers.length - 1]();
}

export async function validateIdleStateMod(context: DirectContext): Promise<DirectResult> {
  const hooks = await loadHooks(path.join(context.clone, "idle-state", "mod", "hooks", "register.ts"));
  const state = { runningPrograms: [{ command: "node server.js --port=(80)", purpose: "serves" }] };
  const replyRef = { text: JSON.stringify(state) };
  const { engine, calls } = createIdleEngine(context, replyRef);
  await executeStateTurn(hooks, engine, calls);
  const duringPrompt = await hooks["tool.call"](engine, { tool: "Read" }, wrapEvent);
  await hooks["turn.complete"](engine, ANSWER, wrapEvent);
  const afterTurn = await hooks["tool.call"](engine, { tool: "Read" }, wrapEvent);
  replyRef.text = `Sure, here it is: ${JSON.stringify(state)} Hope that helps.`;
  await executeStateTurn(hooks, engine, calls);
  const wrapped = await Promise.allSettled([hooks["turn.complete"](engine, ANSWER, wrapEvent)]);
  const deniesTools = typeof duringPrompt.deny === "string" && afterTurn.passed !== undefined;
  const escapesPattern = calls.pgrepArgs[0] === "node server\\.js --port=\\(80\\)";
  const rejectsWrapped = wrapped[0].status === "rejected" && String(wrapped[0].reason).includes("not a bare JSON object");
  const ok = deniesTools && escapesPattern && rejectsWrapped;
  return buildResult(42, "idle-state (mod)", ok, `tools denied while the state prompt is pending, allowed after: ${formatFlag(deniesTools)}; pgrep gets an escaped pattern: ${formatFlag(escapesPattern)}; reply wrapped in text throws: ${formatFlag(rejectsWrapped)}`);
}
*/
