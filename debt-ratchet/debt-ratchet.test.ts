// #!/usr/bin/env node
// import { test } from "node:test";
// import { strict as assert } from "node:assert";
// import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, symlinkSync, rmSync, existsSync, readdirSync, utimesSync } from "node:fs";
// import { tmpdir } from "node:os";
// import { resolve } from "node:path";
// import { spawnSync } from "node:child_process";
// import { randomUUID } from "node:crypto";
// import { computeDebt, removeOldLedgers } from "./debt-ratchet.ts";

// const ARRAY_DEBT_DIR = mkdtempSync(`${tmpdir()}/debt-ratchet-ledgers-`);

// const ESLINT_CONFIG = `
// export default [
//   {
//     files: ['**/*.ts'],
//     rules: {
//       'no-restricted-syntax': [
//         'error',
//         {
//           selector: 'CallExpression[callee.type="MemberExpression"][callee.property.name=/^(map|filter|reduce|forEach|flatMap|some|every|find|findIndex)$/]',
//           message: 'Use a for loop that pushes into a named result array.',
//         },
//       ],
//     },
//   },
// ];
// `;

// const STYLISTIC_ESLINT_CONFIG = `
// import stylistic from '@stylistic/eslint-plugin';
// export default [
//   {
//     files: ['**/*.ts'],
//     plugins: { '@stylistic': stylistic },
//     rules: {
//       '@stylistic/brace-style': ['error', 'stroustrup'],
//     },
//   },
// ];
// `;

// function setUpRepo(headSource: string): string {
//   const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-`);
//   spawnSync("git", ["init"], { cwd: dir });
//   spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
//   spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
//   writeFileSync(`${dir}/eslint.config.js`, ESLINT_CONFIG);
//   writeFileSync(`${dir}/subject.ts`, headSource);
//   spawnSync("git", ["add", "-A"], { cwd: dir });
//   spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
//   return dir;
// }

// function writeTranscript(dir: string, filePath: string): string {
//   const path = `${dir}/transcript.jsonl`;
//   const lines = [
//     JSON.stringify({ type: "user", message: { content: "add a helper" } }),
//     JSON.stringify({
//       type: "assistant",
//       message: {
//         content: [{ type: "tool_use", name: "Edit", input: { file_path: filePath } }],
//       },
//     }),
//   ];
//   writeFileSync(path, `${lines.join("\n")}\n`);
//   return path;
// }

// function runHook(input: object): string {
//   const run = spawnSync("node", [`${import.meta.dirname}/debt-ratchet.ts`], {
//     input: JSON.stringify(input),
//     encoding: "utf8",
//     env: { ...process.env, DEBT_LEDGER_DIR: ARRAY_DEBT_DIR },
//   });
//   return run.stdout.trim();
// }

// test("first sighting with debt: blocked, ledger not written", () => {
//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(
//     `${repo}/subject.ts`,
//     "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
//   );
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
//   assert.match(output, /"decision":"block"/);
//   assert.match(output, /Style debt is 1 and must drop below 1/);
//   assert.equal(existsSync(ledgerPath), false);
// });

// // test("HEAD has 1 violation, working copy has the same 1: allowed", () => {
// //   const repo = setUpRepo("export function nums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n");
// //   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
// //   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
// //   const output = runHook({ transcript_path, stop_hook_active: false });
// //   assert.equal(output, "");
// // });
// // Superseded by the per-session ledger ratchet: an unchanged debt count now blocks (see "existing ledger with same total: blocked").

// test("subagent edits are collected: only the edit at/after turn start is evaluated", () => {
//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(`${repo}/ignored.ts`, "export function getOtherNums() {\n  return [4, 5, 6];\n}\n");
//   spawnSync("git", ["add", "-A"], { cwd: repo });
//   spawnSync("git", ["commit", "-m", "add ignored file"], { cwd: repo });

//   writeFileSync(
//     `${repo}/subject.ts`,
//     "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
//   );
//   writeFileSync(
//     `${repo}/ignored.ts`,
//     "export function getOtherNums() {\n  return [4, 5, 6].map((n) => n + 1);\n}\n",
//   );

//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const sessionId = "session1";
//   const transcript_path = `${transcriptDir}/${sessionId}.jsonl`;
//   const turnStart = "2024-01-01T00:00:01.000Z";
//   writeFileSync(
//     transcript_path,
//     `${JSON.stringify({ type: "user", timestamp: turnStart, message: { content: "add a helper" } })}\n`,
//   );

//   const subagentsDir = `${transcriptDir}/${sessionId}/subagents`;
//   mkdirSync(subagentsDir, { recursive: true });
//   const beforeTurnStart = JSON.stringify({
//     type: "assistant",
//     timestamp: "2024-01-01T00:00:00.000Z",
//     message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${repo}/ignored.ts` } }] },
//   });
//   const afterTurnStart = JSON.stringify({
//     type: "assistant",
//     timestamp: "2024-01-01T00:00:02.000Z",
//     message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${repo}/subject.ts` } }] },
//   });
//   writeFileSync(`${subagentsDir}/agent-x.jsonl`, `${beforeTurnStart}\n${afterTurnStart}\n`);

//   const output = runHook({ transcript_path, session_id: randomUUID(), stop_hook_active: false });
//   assert.match(output, /"decision":"block"/);
//   assert.match(output, /Style debt is 1 and must drop below 1/);
//   assert.match(output, /subject\.ts/);
//   assert.doesNotMatch(output, /ignored\.ts/);
// });

// test("SubagentStop: a fake agent transcript with one Edit tool_use yields that file path", () => {
//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(
//     `${repo}/subject.ts`,
//     "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
//   );
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-agent-transcript-`);
//   const agent_transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ agent_transcript_path, session_id: randomUUID(), stop_hook_active: false });
//   assert.match(output, /"decision":"block"/);
//   assert.match(output, /subject\.ts/);
// });

// test("computeDebt on a repo with no eslint.config.js and no node_modules returns a numeric count", () => {
//   const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-noconfig-`);
//   spawnSync("git", ["init"], { cwd: dir });
//   spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
//   spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
//   writeFileSync(`${dir}/subject.ts`, "export function getNums() { return [1, 2, 3].map((n) => n + 1); }\n");
//   spawnSync("git", ["add", "-A"], { cwd: dir });
//   spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
//   const debt = computeDebt(`${dir}/subject.ts`);
//   assert.equal(typeof debt?.current, "number");
// });

// test("computeDebt outside dotfiles is not ignored by the eslint base path: real findings", () => {
//   const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-basepath-`);
//   spawnSync("git", ["init"], { cwd: dir });
//   spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
//   spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
//   writeFileSync(`${dir}/subject.ts`, "const a = 1; const b = 2;\n");
//   spawnSync("git", ["add", "-A"], { cwd: dir });
//   spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });
//   const debt = computeDebt(`${dir}/subject.ts`);
//   assert.equal(debt?.current, 1);
//   assert.deepEqual(debt?.lines, [1]);
// });

// test("eslint --fix runs: fixable brace-style debt is fixed in place, and the reformat is announced", () => {
//   const dotfilesRoot = resolve(import.meta.dirname, "..", "..");
//   const dir = mkdtempSync(`${tmpdir()}/debt-ratchet-stylistic-`);
//   spawnSync("git", ["init"], { cwd: dir });
//   spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
//   spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
//   symlinkSync(`${dotfilesRoot}/node_modules`, `${dir}/node_modules`);
//   writeFileSync(`${dir}/eslint.config.js`, STYLISTIC_ESLINT_CONFIG);
//   const headSource =
//     "export function computeValue(x) {\n  if (x > 0) {\n    return 1;\n  }\n  else {\n    return 2;\n  }\n}\n";
//   writeFileSync(`${dir}/subject.ts`, headSource);
//   spawnSync("git", ["add", "-A"], { cwd: dir });
//   spawnSync("git", ["commit", "-m", "initial"], { cwd: dir });

//   const cuddledSource =
//     "export function computeValue(x) {\n  if (x > 0) {\n    return 1;\n  } else {\n    return 2;\n  }\n}\n";
//   writeFileSync(`${dir}/subject.ts`, cuddledSource);

//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${dir}/subject.ts`);
//   const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
//   assert.match(output, /"additionalContext"/);
//   assert.match(output, /This hook reformatted these files to the house layout/);
//   assert.match(output, /subject\.ts/);
//   const fixedOnDisk = readFileSync(`${dir}/subject.ts`, "utf8");
//   assert.match(fixedOnDisk, /\}\s*\n\s*else\s*\{/);
//   assert.equal(existsSync(ledgerPath), false);
//   rmSync(ledgerPath, { force: true });
// });

// test("already-clean fixture: no reformat message", () => {
//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
//   assert.equal(output, "");
//   rmSync(ledgerPath, { force: true });
// });

// test("existing ledger with a higher total: new lower total drops through, allowed", () => {
//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
//   writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 5 }));

//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(
//     `${repo}/subject.ts`,
//     "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
//   );
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
//   assert.equal(output, "");

//   const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
//   assert.equal(ledger.total, 1);
//   rmSync(ledgerPath, { force: true });
// });

// test("existing ledger with the same total: blocked", () => {
//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
//   writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 1 }));

//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(
//     `${repo}/subject.ts`,
//     "export function getNums() {\n  return [1, 2, 3].map((n) => n + 1);\n}\n",
//   );
//   const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
//   const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
//   assert.match(output, /"decision":"block"/);
//   assert.match(output, /Style debt is 1 and must drop below 1/);
//   rmSync(ledgerPath, { force: true });
// });

// test("two runs, same session id, different files: debts merge into one total", () => {
//   const sessionId = randomUUID();
//   const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
//   mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
//   writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 100 }));

//   const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
//   writeFileSync(`${repo}/fileA.ts`, "export function getA() {\n  return [1].map((n) => n);\n}\n");
//   writeFileSync(
//     `${repo}/fileB.ts`,
//     "export function getB() {\n  return [1, 2].map((n) => n).filter((n) => n);\n}\n",
//   );
//   spawnSync("git", ["add", "-A"], { cwd: repo });
//   spawnSync("git", ["commit", "-m", "add files"], { cwd: repo });

//   const transcriptDir1 = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path1 = writeTranscript(transcriptDir1, `${repo}/fileA.ts`);
//   const output1 = runHook({ transcript_path: transcript_path1, session_id: sessionId, stop_hook_active: false });
//   assert.equal(output1, "");

//   const transcriptDir2 = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
//   const transcript_path2 = writeTranscript(transcriptDir2, `${repo}/fileB.ts`);
//   const output2 = runHook({ transcript_path: transcript_path2, session_id: sessionId, stop_hook_active: false });
//   assert.match(output2, /"decision":"block"/);
//   assert.match(output2, /Style debt is 3 and must drop below 1/);
//   assert.match(output2, /fileB\.ts/);
//   assert.doesNotMatch(output2, /fileA\.ts/);

//   rmSync(ledgerPath, { force: true });
// });

// test("removeOldLedgers: deletes ledgers older than 7 days, keeps fresh ones", () => {
//   const dir = mkdtempSync(`${tmpdir()}/array-debt-`);
//   writeFileSync(`${dir}/old.json`, "{}");
//   writeFileSync(`${dir}/fresh.json`, "{}");
//   const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
//   utimesSync(`${dir}/old.json`, eightDaysAgo, eightDaysAgo);
//   removeOldLedgers(dir, Date.now());
//   assert.deepEqual(readdirSync(dir), ["fresh.json"]);
// });
