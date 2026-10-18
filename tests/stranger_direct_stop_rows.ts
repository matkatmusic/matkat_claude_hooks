// Direct rows 32 to 37: typecheck-on-stop and unlisted-items, run on the bed clone with crafted Stop input.
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type DirectContext, type DirectResult, buildResult, createTypeScriptProject, formatFlag, isHookBlocked, readBlockReason, executeHook, writeJsonLines } from "./stranger_direct_support.ts";

const TYPECHECK_SCRIPT = "typecheck-on-stop/typecheck-on-stop.ts";
const UNLISTED_SCRIPT = "unlisted-items/unlisted-items.ts";
const BAD_LINE = 'const x: number = "hello";\n';
const OK_LINE = "export const y = 1;\n";

function writeEditTranscript(context: DirectContext, name: string, editedFile: string): string {
  const transcript = path.join(context.direct, "transcripts", `${name}.jsonl`);
  const prompt = { type: "user", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "go" } };
  const edit = { type: "assistant", timestamp: "2026-01-01T00:00:01.000Z", cwd: path.dirname(editedFile), message: { role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: editedFile } }] } };
  writeJsonLines(transcript, [prompt, edit]);
  return transcript;
}

function executeTypecheck(context: DirectContext, dir: string, transcript: string, isActive: boolean, extraEnv: Record<string, string> = {}) {
  const input = { hook_event_name: "Stop", session_id: "direct-typecheck", cwd: dir, transcript_path: transcript, stop_hook_active: isActive };
  return executeHook(context, TYPECHECK_SCRIPT, input, dir, extraEnv);
}

export function validateTypecheckTsx(context: DirectContext): DirectResult {
  const dir = createTypeScriptProject(context, "ts-tsx", { "bad.tsx": BAD_LINE });
  const run = executeTypecheck(context, dir, writeEditTranscript(context, "tc-tsx", path.join(dir, "bad.tsx")), false);
  const blocks = isHookBlocked(run) && readBlockReason(run).includes("error TS2322");
  const hasSummary = run.stdout.includes("tsc found 1 errors");
  return buildResult(32, "typecheck-on-stop (.tsx)", blocks && hasSummary, `.tsx edit starts the check and blocks on error TS2322: ${formatFlag(blocks)}; reason keeps the tsc summary line: ${formatFlag(hasSummary)}`);
}

export function validateTypecheckOtherFiles(context: DirectContext): DirectResult {
  const dir = createTypeScriptProject(context, "ts-other", { "old.ts": BAD_LINE, "fresh.ts": OK_LINE });
  const run = executeTypecheck(context, dir, writeEditTranscript(context, "tc-other", path.join(dir, "fresh.ts")), false);
  const notBlocked = !isHookBlocked(run);
  const notesOldError = run.stdout.includes("in other files") && run.stdout.includes("old.ts");
  return buildResult(33, "typecheck-on-stop (old error)", notBlocked && notesOldError, `old error in an untouched file does not block: ${formatFlag(notBlocked)}; it is only noted: ${formatFlag(notesOldError)}`);
}

export function validateTypecheckRepeatStops(context: DirectContext): DirectResult {
  const dir = createTypeScriptProject(context, "ts-repeat", { "bad.ts": BAD_LINE });
  const transcript = writeEditTranscript(context, "tc-repeat", path.join(dir, "bad.ts"));
  let blockedCount = 0;
  for (let stop = 0; stop < 3; stop++) {
    const run = executeTypecheck(context, dir, transcript, stop > 0);
    const isBlocked = isHookBlocked(run);
    if (isBlocked)
      blockedCount += 1;
  }
  const fourth = executeTypecheck(context, dir, transcript, true);
  const letsPass = !isHookBlocked(fourth) && fourth.stdout.includes("already blocked 3 times");
  return buildResult(34, "typecheck-on-stop (repeat)", blockedCount === 3 && letsPass, `blocked on stops 1 to 3 (even with stop_hook_active): ${blockedCount} of 3; stop 4 passes with a note: ${formatFlag(letsPass)}`);
}

export function validateTypecheckStartFailure(context: DirectContext): DirectResult {
  const dir = createTypeScriptProject(context, "ts-nostart", { "fresh.ts": OK_LINE });
  const fakeBin = path.join(context.direct, "fake-bin");
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(path.join(fakeBin, "npx"), "#!/bin/sh\necho boom >&2\nexit 3\n");
  chmodSync(path.join(fakeBin, "npx"), 0o755);
  const transcript = writeEditTranscript(context, "tc-nostart", path.join(dir, "fresh.ts"));
  const run = executeTypecheck(context, dir, transcript, false, { PATH: `${fakeBin}:${process.env.PATH}` });
  const isBlocked = isHookBlocked(run);
  const reason = isBlocked ? readBlockReason(run) : "";
  const namesFailure = reason.includes("TSC FAILED TO START") && reason.includes("Exit status 3") && reason.includes("boom");
  return buildResult(35, "typecheck-on-stop (no tsc)", isBlocked && namesFailure, `a tsc that cannot start blocks with its exit status and stderr: ${formatFlag(namesFailure)}`);
}

function writeOpenTask(context: DirectContext, sessionId: string, subject: string): void {
  const tasksDir = path.join(context.direct, "tasks", sessionId);
  mkdirSync(tasksDir, { recursive: true });
  writeFileSync(path.join(tasksDir, "1.json"), JSON.stringify({ subject, status: "pending" }));
}

function executeUnlisted(context: DirectContext, sessionId: string, message: string) {
  const input = { hook_event_name: "Stop", session_id: sessionId, stop_hook_active: false, last_assistant_message: message };
  return executeHook(context, UNLISTED_SCRIPT, input, context.direct);
}

export function validateUnlistedQuotedAndReworded(context: DirectContext): DirectResult {
  writeOpenTask(context, "direct-unlisted-a", "Create login screens");
  const quoted = executeUnlisted(context, "direct-unlisted-a", 'The phrase "next step: build the login page" is a trigger.');
  const reworded = executeUnlisted(context, "direct-unlisted-a", "next step: build the login screen");
  const ignoresQuote = !isHookBlocked(quoted);
  const matchesReworded = !isHookBlocked(reworded);
  return buildResult(36, "unlisted-items (words)", ignoresQuote && matchesReworded, `quoted "next step:" passes: ${formatFlag(ignoresQuote)}; "login screen" matches task "login screens": ${formatFlag(matchesReworded)}`);
}

export function validateUnlistedSharedWords(context: DirectContext): DirectResult {
  writeOpenTask(context, "direct-unlisted-b", "Fix checkout webhooks logging");
  const run = executeUnlisted(context, "direct-unlisted-b", "next step: build the payment gateway integration for checkout webhooks");
  const blocks = isHookBlocked(run) && readBlockReason(run).includes("payment gateway");
  return buildResult(37, "unlisted-items (overlap)", blocks, `two shared words no longer hide an unrelated missing item: ${formatFlag(blocks)}`);
}
