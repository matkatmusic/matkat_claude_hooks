// Disabled: direct rows 38 to 40 are now live rows 66 (chain), 67 (reader subfolder) and 68 (check ls) in run_stranger.ts.
// // Direct rows 38 to 40: debt-ratchet, idle-state-reader, idle-state-check.
// import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
// import path from "node:path";
// import { type DirectContext, type DirectResult, buildResult, formatFlag, isHookBlocked, readBlockReason, executeCommand, executeHook, writeJsonLines } from "./stranger_direct_support.ts";
//
// const DEBT_SCRIPT = "debt-ratchet/debt-ratchet.ts";
// const READER_SCRIPT = "idle-state/idle-state-reader.ts";
// const CHECK_SCRIPT = "idle-state/idle-state-check.ts";
// const ADD_SOURCE = "export function add(a: number, b: number): number {\n  return a + b;\n}\n";
// const STATE_FILE_NAME = "2026-10-17-1200-abcd1234.json";
//
// function executeDebtStop(context: DirectContext, dir: string, transcript: string, isActive: boolean) {
//   const input = { hook_event_name: "Stop", session_id: "direct-debt", cwd: dir, transcript_path: transcript, stop_hook_active: isActive };
//   return executeHook(context, DEBT_SCRIPT, input, dir);
// }
//
// export function validateDebtRatchetChain(context: DirectContext): DirectResult {
//   const dir = path.join(context.direct, "debt-project");
//   mkdirSync(dir, { recursive: true });
//   executeCommand(["git", "init", "-q"], dir);
//   const file = path.join(dir, "add.ts");
//   writeFileSync(file, ADD_SOURCE);
//   const transcript = path.join(context.direct, "transcripts", "debt.jsonl");
//   const prompt = { type: "user", timestamp: "2026-01-01T00:00:00.000Z", message: { role: "user", content: "go" } };
//   const edit = { type: "assistant", timestamp: "2026-01-01T00:00:01.000Z", cwd: dir, message: { role: "assistant", model: "claude-sonnet-5-5", content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: file } }] } };
//   writeJsonLines(transcript, [prompt, edit]);
//   const first = executeDebtStop(context, dir, transcript, false);
//   const ledgerSaved = existsSync(path.join(context.direct, "array-debt", "direct-debt.json"));
//   const blocksFirst = isHookBlocked(first);
//   const saysOrFewer = blocksFirst && readBlockReason(first).includes("or fewer");
//   const second = executeDebtStop(context, dir, transcript, true);
//   const third = executeDebtStop(context, dir, transcript, true);
//   const fourth = executeDebtStop(context, dir, transcript, true);
//   const keepsBlocking = isHookBlocked(second) && isHookBlocked(third);
//   const givesUp = fourth.stdout.trim() === "";
//   const ok = blocksFirst && saysOrFewer && ledgerSaved && keepsBlocking && givesUp;
//   return buildResult(38, "debt-ratchet (chain)", ok, `first stop blocks: ${formatFlag(blocksFirst)}; text says "or fewer": ${formatFlag(saysOrFewer)}; ledger saved on the block: ${formatFlag(ledgerSaved)}; stops 2 and 3 (stop_hook_active) still block: ${formatFlag(keepsBlocking)}; stop 4 passes: ${formatFlag(givesUp)}`);
// }
//
// function createIdleProject(context: DirectContext): string {
//   const root = path.join(context.direct, "idle-project");
//   const deepDir = path.join(root, "src", "deep");
//   mkdirSync(deepDir, { recursive: true });
//   mkdirSync(path.join(root, ".git"), { recursive: true });
//   mkdirSync(path.join(root, ".idleState"), { recursive: true });
//   const stateFile = path.join(root, ".idleState", STATE_FILE_NAME);
//   writeFileSync(stateFile, "{}");
//   const now = Date.now() / 1000;
//   utimesSync(stateFile, now, now);
//   return deepDir;
// }
//
// function executeIdleReader(context: DirectContext, deepDir: string, transcript: string) {
//   const input = { hook_event_name: "UserPromptSubmit", session_id: "direct-idle", prompt: "hello", cwd: deepDir, transcript_path: transcript };
//   return executeHook(context, READER_SCRIPT, input, deepDir);
// }
//
// export function validateIdleReaderSubfolder(context: DirectContext): DirectResult {
//   const deepDir = createIdleProject(context);
//   const run = executeIdleReader(context, deepDir, path.join(context.direct, "transcripts", "idle-reader.jsonl"));
//   const found = run.stdout.includes(STATE_FILE_NAME);
//   return buildResult(39, "idle-state (reader)", found, `session started two folders below the repo root still finds .idleState: ${formatFlag(found)}`);
// }
//
// function executeIdleCheck(context: DirectContext, deepDir: string, transcript: string) {
//   const input = { hook_event_name: "Stop", session_id: "direct-idle-check", cwd: deepDir, transcript_path: transcript, last_assistant_message: "" };
//   return executeHook(context, CHECK_SCRIPT, input, deepDir);
// }
//
// export function validateIdleCheckReadTool(context: DirectContext): DirectResult {
//   const deepDir = createIdleProject(context);
//   const transcript = path.join(context.direct, "transcripts", "idle-check.jsonl");
//   executeIdleReader(context, deepDir, transcript);
//   const stateFile = path.join(deepDir, "..", "..", ".idleState", STATE_FILE_NAME);
//   const prompt = { type: "user", message: { role: "user", content: "hello" } };
//   const listCall = { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: `ls ${stateFile}` } }, { type: "text", text: `Saw ${STATE_FILE_NAME.replace(".json", "")}` }] } };
//   const readCall = { type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "Read", input: { file_path: path.resolve(stateFile) } }, { type: "text", text: `Saw ${STATE_FILE_NAME.replace(".json", "")}` }] } };
//   writeJsonLines(transcript, [prompt, listCall]);
//   const afterList = executeIdleCheck(context, deepDir, transcript);
//   writeJsonLines(transcript, [prompt, listCall, readCall]);
//   const afterRead = executeIdleCheck(context, deepDir, transcript);
//   const blocksOnList = isHookBlocked(afterList) && readBlockReason(afterList).includes("Not read yet");
//   const passesAfterRead = afterRead.stdout.trim() === "";
//   return buildResult(40, "idle-state (check)", blocksOnList && passesAfterRead, `an ls that shows the file name does not count as a read: ${formatFlag(blocksOnList)}; a Read of the file passes: ${formatFlag(passesAfterRead)}`);
// }
