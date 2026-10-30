#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { findEditedFilePaths, findSubagentEditedFilePaths } from "../shared/debt-transcript.ts";
import { filterUniqueNonTestTsFiles } from "../shared/debt-files.ts";
import { getSetting } from "../shared/settings.ts";
import { computeDebt, blockReason, type FileDebt } from "./debt-compute.ts";
import { removeOldLedgers } from "./debt-ratchet-ledger-cleanup.ts";
// Stop hook: blocks the turn if its edits raised eslint violation counts above the HEAD baseline.

const MAX_CHAIN_BLOCKS = 3;

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const LEDGER_DIR = getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR");
  const ledgerMaxAgeMs = Number(getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS"));
  const limits = {
    maxFileLines: Number(getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES")),
    debtTarget: Number(getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET")),
    fixBatchSize: Number(getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE")),
    minFileDebt: Number(getSetting(input, "CLAUDE_HOOKS_DEBT_RATCHET_MIN_FILE_DEBT")),
  };
  const isReentrant = input.stop_hook_active === true;
  mkdirSync(LEDGER_DIR, { recursive: true });
  const blocksPath = `${LEDGER_DIR}/${input.session_id}.blocks`;
  let chainBlocks = 0;
  const hasBlocksFile = existsSync(blocksPath);
  const shouldReadBlocks = isReentrant && hasBlocksFile;
  if (shouldReadBlocks)
    chainBlocks = Number(readFileSync(blocksPath, "utf8"));
  const isChainExhausted = chainBlocks >= MAX_CHAIN_BLOCKS;
  if (isChainExhausted)
    process.exit(0);
  const isSubagentTranscript = typeof input.agent_transcript_path === "string";
  let files: string[];
  if (isSubagentTranscript) {
    const hasAgentTranscript = existsSync(input.agent_transcript_path);
    if (!hasAgentTranscript) {
      mkdirSync(dirname(input.agent_transcript_path), { recursive: true });
      writeFileSync(input.agent_transcript_path, "");
    }
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
  for (let i = files.length - 1; i >= 0; i--) {
    const isDeleted = !existsSync(files[i]);
    if (isDeleted)
      files.splice(i, 1);
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

  removeOldLedgers(LEDGER_DIR, Date.now(), ledgerMaxAgeMs);
  const ledgerPath = `${LEDGER_DIR}/${input.session_id}.json`;
  const ledgerExists = existsSync(ledgerPath);
  let ledgerFiles: Record<string, number> = {};
  let savedTotal: number | undefined;
  if (ledgerExists) {
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledgerFiles = ledger.files;
    savedTotal = ledger.total;
  }
  const measuredFiles: Record<string, number> = {};
  for (let i = 0; i < debts.length; i++) {
    measuredFiles[debts[i].file] = debts[i].current;
  }
  const savedFilePaths = Object.keys(ledgerFiles);
  for (let i = 0; i < savedFilePaths.length; i++) {
    const savedPath = savedFilePaths[i];
    const isMeasuredThisTurn = savedPath in measuredFiles;
    const isTestFile = savedPath.endsWith(".test.ts");
    const isStillThere = existsSync(savedPath);
    const shouldRemeasure = !isMeasuredThisTurn && !isTestFile && isStillThere;
    if (!shouldRemeasure)
      continue;
    const freshDebt = computeDebt(savedPath);
    if (freshDebt)
      measuredFiles[savedPath] = freshDebt.current;
  }
  ledgerFiles = measuredFiles;
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

  const reason = blockReason(debts, newTotal, savedTotal, reformattedFiles, limits);
  const hasDebt = newTotal > 0;
  const shouldSaveLedger = hasDebt || ledgerExists;
  if (shouldSaveLedger)
    writeFileSync(ledgerPath, JSON.stringify({ files: ledgerFiles, total: newTotal }));
  if (reason) {
    writeFileSync(blocksPath, String(chainBlocks + 1));
    console.log(JSON.stringify({ decision: "block", reason }));
  }
  else {
    const hasReformattedFiles = reformattedFiles.length > 0;
    if (hasReformattedFiles) {
      const additionalContext = `This hook reformatted these files to the house layout: ${reformattedFiles.join(", ")}. Do not revert that reformatting.`;
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: input.hook_event_name, additionalContext } }),
      );
    }
  }
}
