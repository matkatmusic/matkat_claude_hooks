#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync, statSync, unlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { findEditedFilePaths, findSubagentEditedFilePaths } from "../shared/debt-transcript.ts";
import { filterUniqueNonTestTsFiles } from "../shared/debt-files.ts";
import { readEnvValue } from "../shared/env.ts";
import { computeDebt, blockReason, type FileDebt } from "./debt-compute.ts";
// Stop hook: blocks the turn if its edits raised eslint violation counts above the HEAD baseline.

const LEDGER_DIR = readEnvValue("CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR");
const LEDGER_MAX_AGE_MS = Number(readEnvValue("CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS"));

// Deletes ledger files older than LEDGER_MAX_AGE_MS from dir.
export function removeOldLedgers(dir: string, now: number): void {
  const files = readdirSync(dir);
  for (let i = 0; i < files.length; i++) {
    const path = `${dir}/${files[i]}`;
    const isOld = now - statSync(path).mtimeMs > LEDGER_MAX_AGE_MS;
    if (isOld)
      unlinkSync(path);
  }
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isReentrant = input.stop_hook_active === true;
  if (isReentrant)
    process.exit(0);
  const isSubagentTranscript = typeof input.agent_transcript_path === "string";
  let files: string[];
  if (isSubagentTranscript) {
    const agentTranscript = readFileSync(input.agent_transcript_path, "utf8");
    files = findEditedFilePaths(agentTranscript).files;
  }
  else {
    const transcript = readFileSync(input.transcript_path, "utf8");
    const turn = findEditedFilePaths(transcript);
    files = turn.files;
    const turnStartTimestamp = turn.turnStartTimestamp;
    const hasTurnStart = turnStartTimestamp !== undefined;
    if (hasTurnStart) {
      const transcriptDir = dirname(input.transcript_path);
      const sessionId = basename(input.transcript_path, ".jsonl");
      const subagentsDir = join(transcriptDir, sessionId, "subagents");
      const subagentFiles = findSubagentEditedFilePaths(subagentsDir, turnStartTimestamp);
      for (let i = 0; i < subagentFiles.length; i++)
        files.push(subagentFiles[i]);
    }
  }
  const uniqueFiles = filterUniqueNonTestTsFiles(files);
  const debts: FileDebt[] = [];
  for (let i = 0; i < uniqueFiles.length; i++) {
    const debt = computeDebt(uniqueFiles[i]);
    if (!debt)
      continue;
    debts.push(debt);
  }
  const testFiles: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const isTestFile = files[i].endsWith(".test.ts");
    let alreadyAdded = false;
    for (let j = 0; j < testFiles.length; j++) {
      if (testFiles[j] === files[i])
        alreadyAdded = true;
    }
    const isNewTestFile = isTestFile && !alreadyAdded;
    if (isNewTestFile)
      testFiles.push(files[i]);
  }
  for (let i = 0; i < testFiles.length; i++) {
    const testSource = readFileSync(testFiles[i], "utf8");
    const trimmedSource = testSource.trimEnd();
    const lineCount = trimmedSource.split("\n").length;
    debts.push({ file: testFiles[i], current: 0, lines: [], reformatted: false, lineCount, missingTest: false });
  }

  mkdirSync(LEDGER_DIR, { recursive: true });
  removeOldLedgers(LEDGER_DIR, Date.now());
  const ledgerPath = `${LEDGER_DIR}/${input.session_id}.json`;
  const ledgerExists = existsSync(ledgerPath);
  let ledgerFiles: Record<string, number> = {};
  let savedTotal: number | undefined;
  if (ledgerExists) {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledgerFiles = ledger.files;
    savedTotal = ledger.total;
  }
  for (let i = 0; i < debts.length; i++) {
    ledgerFiles[debts[i].file] = debts[i].current;
  }
  let newTotal = 0;
  const ledgerFilePaths = Object.keys(ledgerFiles);
  for (let i = 0; i < ledgerFilePaths.length; i++) {
    newTotal += ledgerFiles[ledgerFilePaths[i]];
  }

  const reformattedFiles: string[] = [];
  for (let i = 0; i < debts.length; i++) {
    const debt = debts[i];
    if (debt.reformatted)
      reformattedFiles.push(debt.file);
  }

  const reason = blockReason(debts, newTotal, savedTotal, reformattedFiles);
  if (reason) {
    console.log(JSON.stringify({ decision: "block", reason }));
  }
  else {
    const hasDebt = newTotal > 0;
    if (hasDebt)
      writeFileSync(ledgerPath, JSON.stringify({ files: ledgerFiles, total: newTotal }));
    const hasReformattedFiles = reformattedFiles.length > 0;
    if (hasReformattedFiles) {
      const additionalContext = `This hook reformatted these files to the house layout: ${reformattedFiles.join(", ")}. Do not revert that reformatting.`;
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext } }),
      );
    }
  }
}
