#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync, readdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ARRAY_DEBT_DIR, setDebtRatchetEnv, setUpRepo, writeTranscript, runHook } from "./debt-ratchet-test-helpers.ts";

setDebtRatchetEnv();
const { removeOldLedgers } = await import("./debt-ratchet.ts");

test("already-clean fixture: no reformat message", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.equal(output, "");
  rmSync(ledgerPath, { force: true });
});

test("existing ledger with a higher total: new lower total drops through, allowed", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 5 }));

  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.equal(output, "");

  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  assert.equal(ledger.total, 1);
  rmSync(ledgerPath, { force: true });
});

test("stale ledger entry for a file that is now clean: not blocked", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/other.ts`, "export const other = 1;\n");
  writeFileSync(`${repo}/other.test.ts`, "export const check = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add other"], { cwd: repo });
  writeFileSync(ledgerPath, JSON.stringify({ files: { [`${repo}/other.ts`]: 6 }, total: 6 }));
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.equal(output, "");
  rmSync(ledgerPath, { force: true });
});

test("total dropping to 0: ledger saved with 0", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 5 }));
  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.equal(JSON.parse(readFileSync(ledgerPath, "utf8")).total, 0);
  rmSync(ledgerPath, { force: true });
});

test("existing ledger with the same total: blocked", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 1 }));

  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(
    `${repo}/subject.ts`,
    "function addOne(n: number): number {\n  return n + 1;\n}\nexport function getNums() {\n  return [1, 2, 3].map(addOne);\n}\n",
  );
  const transcriptDir = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path = writeTranscript(transcriptDir, `${repo}/subject.ts`);
  const output = runHook({ transcript_path, session_id: sessionId, stop_hook_active: false });
  assert.match(output, /"decision":"block"/);
  assert.match(output, /Style debt is 1 and must drop to 0 or fewer/);
  rmSync(ledgerPath, { force: true });
});

test("two runs, same session id, different files: debts merge into one total", () => {
  const sessionId = randomUUID();
  const ledgerPath = `${ARRAY_DEBT_DIR}/${sessionId}.json`;
  mkdirSync(ARRAY_DEBT_DIR, { recursive: true });
  writeFileSync(ledgerPath, JSON.stringify({ files: {}, total: 100 }));

  const repo = setUpRepo("export function getNums() {\n  return [1, 2, 3];\n}\n");
  writeFileSync(`${repo}/fileA.ts`, "function getSame(n: number): number {\n  return n;\n}\nexport function getA() {\n  return [1].map(getSame);\n}\n");
  writeFileSync(
    `${repo}/fileB.ts`,
    "function getSame(n: number): number {\n  return n;\n}\nexport function getB() {\n  return [1, 2].map(getSame).filter(getSame);\n}\n",
  );
  writeFileSync(`${repo}/fileA.test.ts`, "export const check = 1;\n");
  writeFileSync(`${repo}/fileB.test.ts`, "export const check = 1;\n");
  spawnSync("git", ["add", "-A"], { cwd: repo });
  spawnSync("git", ["commit", "-m", "add files"], { cwd: repo });

  const transcriptDir1 = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path1 = writeTranscript(transcriptDir1, `${repo}/fileA.ts`);
  const output1 = runHook({ transcript_path: transcript_path1, session_id: sessionId, stop_hook_active: false });
  assert.equal(output1, "");

  const transcriptDir2 = mkdtempSync(`${tmpdir()}/debt-ratchet-transcript-`);
  const transcript_path2 = writeTranscript(transcriptDir2, `${repo}/fileB.ts`);
  const output2 = runHook({ transcript_path: transcript_path2, session_id: sessionId, stop_hook_active: false });
  assert.match(output2, /"decision":"block"/);
  assert.match(output2, /Style debt is 3 and must drop to 0 or fewer/);
  assert.match(output2, /fileB\.ts/);
  assert.doesNotMatch(output2, /fileA\.ts/);

  rmSync(ledgerPath, { force: true });
});

test("removeOldLedgers: deletes ledgers older than 7 days, keeps fresh ones", () => {
  const dir = mkdtempSync(`${tmpdir()}/array-debt-`);
  writeFileSync(`${dir}/old.json`, "{}");
  writeFileSync(`${dir}/fresh.json`, "{}");
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  utimesSync(`${dir}/old.json`, eightDaysAgo, eightDaysAgo);
  removeOldLedgers(dir, Date.now());
  assert.deepEqual(readdirSync(dir), ["fresh.json"]);
});
