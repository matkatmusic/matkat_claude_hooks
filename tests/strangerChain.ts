import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { CHAIN_BLOCKS, CHAIN_DEBT_PROMPT, CHAIN_TYPE_PROMPT, HOOK_FLUSH_S, type JsonRecord, type Row, type Session } from "./strangerConstants.ts";
import { setEnablement } from "./strangerDispatch.ts";
import { addRow, countEvidence, findEvidence } from "./strangerEvidence.ts";
import { listFilesWithSuffix } from "./strangerHelpers.ts";
import { DEBT_SUBAGENT_ROW, TYPECHECK_SUBAGENT_ROW } from "./strangerHookRows.ts";
import { executeOffOnPair, removePromptFiles } from "./strangerPair.ts";
import { executeFullTurn, getSessionModel } from "./strangerTurn.ts";

function listSubagentFiles(session: Session): string[] {
  return listFilesWithSuffix(path.join(session.projectsDir, session.id, "subagents"), ".jsonl");
}

function readSubagentRecords(files: string[]): JsonRecord[] {
  const records: JsonRecord[] = [];
  for (const file of files) {
    const allLines = readFileSync(file, "utf8").split("\n");
    const completeLines = allLines.slice(0, -1);
    for (const line of completeLines) {
      records.push(JSON.parse(line));
    }
  }
  return records;
}

// The SubagentStop hook records go to the subagent transcript, so this turn returns those too.
function executeSubagentTurn(session: Session, prompt: string): JsonRecord[] {
  const knownFiles = listSubagentFiles(session);
  const records = executeFullTurn(session, prompt);
  tmux_lib.sleep(HOOK_FLUSH_S);
  const newFiles: string[] = [];
  for (const file of listSubagentFiles(session)) {
    const isKnown = knownFiles.includes(file);
    if (!isKnown) {
      newFiles.push(file);
    }
  }
  return [...records, ...readSubagentRecords(newFiles)];
}

function setSubagentHooksEnabled(clone: string, on: boolean): void {
  for (const hook of ["typecheckOnStop", "debtRatchet"]) {
    setEnablement(clone, hook, "Stop", on);
    setEnablement(clone, hook, "SubagentStop", on);
  }
}

// Rows 54 and 55: the Stop switches stay off, so only SubagentStop can make the message.
export function executeSubagentStopRows(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "clarifyAmbiguous", "UserPromptSubmit", false);
  setSubagentHooksEnabled(clone, false);
  const typecheckRow = executeOffOnPair(rows, session, bed, TYPECHECK_SUBAGENT_ROW, executeSubagentTurn);
  typecheckRow.hook = "typecheckOnStop (subagent)";
  removePromptFiles(bed);
  setEnablement(clone, "typecheckOnStop", "SubagentStop", false);
  const debtRow = executeOffOnPair(rows, session, bed, DEBT_SUBAGENT_ROW, executeSubagentTurn);
  debtRow.hook = "debtRatchet (subagent)";
  removePromptFiles(bed);
  setSubagentHooksEnabled(clone, true);
  setEnablement(clone, "clarifyAmbiguous", "UserPromptSubmit", true);
}

function addTypeChainRow(rows: Row[], session: Session, bed: string, clone: string): void {
  setEnablement(clone, "debtRatchet", "Stop", false);
  const typeRecords = executeFullTurn(session, CHAIN_TYPE_PROMPT);
  setEnablement(clone, "debtRatchet", "Stop", true);
  removePromptFiles(bed);
  const typeBlocks = countEvidence(typeRecords, 'blockingError":"Type errors remain');
  const hasPassNote = findEvidence(typeRecords, "already blocked 3 times") !== undefined;
  const typeOk = typeBlocks === CHAIN_BLOCKS && hasPassNote;
  addRow(rows, 65, "typecheckOnStop (repeat)", getSessionModel(session), typeOk, `stops blocked while the model ignored the hook: ${typeBlocks} of ${CHAIN_BLOCKS}; next stop passes with the note: ${hasPassNote ? "True" : "False"}`);
}

function addDebtChainRow(rows: Row[], session: Session, bed: string, clone: string): void {
  const ledgerPath = path.join(bed, "array-debt", `${session.id}.json`);
  setEnablement(clone, "typecheckOnStop", "Stop", false);
  rmSync(ledgerPath, { force: true });
  const debtRecords = executeFullTurn(session, CHAIN_DEBT_PROMPT);
  setEnablement(clone, "typecheckOnStop", "Stop", true);
  removePromptFiles(bed);
  const debtBlocks = countEvidence(debtRecords, "Style debt is");
  const saysOrFewer = findEvidence(debtRecords, "or fewer") !== undefined;
  const ledgerSaved = existsSync(ledgerPath);
  const debtOk = debtBlocks === CHAIN_BLOCKS && saysOrFewer && ledgerSaved;
  addRow(rows, 66, "debtRatchet (chain)", getSessionModel(session), debtOk, `stops blocked while the model ignored the hook: ${debtBlocks} of ${CHAIN_BLOCKS}; text says "or fewer": ${saysOrFewer ? "True" : "False"}; ledger saved on the block: ${ledgerSaved ? "True" : "False"}`);
}

// Rows 65 and 66: the model ignores each hook, so it blocks three stops, then passes the fourth.
export function executeChainRows(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "clarifyAmbiguous", "UserPromptSubmit", false);
  addTypeChainRow(rows, session, bed, clone);
  addDebtChainRow(rows, session, bed, clone);
  setEnablement(clone, "clarifyAmbiguous", "UserPromptSubmit", true);
}
