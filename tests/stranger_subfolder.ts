import { spawnSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { ANSI_RE, type JsonRecord, RED_UNKNOWN_MODEL_RE, type Row, type Session, SETTLE_S, SONNET, SUBAGENT_LINE_WAIT_S, SUBFOLDER_PROMPT, TURN_TIMEOUT_S, UNKNOWN_MODEL_ID, UNKNOWN_MODEL_ROW_RE, UNKNOWN_MODEL_SUBAGENT_PROMPT } from "./stranger_constants.ts";
import { setEnablement } from "./stranger_dispatch.ts";
import { addRow, countEvidence, findEvidence } from "./stranger_evidence.ts";
import { readRefreshInterval } from "./stranger_helpers.ts";
import { executePonytailRows } from "./stranger_ponytail.ts";
import { clearToIdlePrompt, launchSession } from "./stranger_session.ts";
import { executeFullTurn, getSessionModel, waitForIdleScreen } from "./stranger_turn.ts";

// The subagent keeps running after the turn ends; the subagent's final message starts one more turn.
function waitForSubagentLineGone(session: Session): void {
  for (let waited = 0; waited < SUBAGENT_LINE_WAIT_S; waited += 2) {
    const screen = tmux_lib.tmux_capturePane(session.name);
    const hasSubagentLine = screen.includes("Unknown model ID");
    if (!hasSubagentLine) {
      break;
    }
    tmux_lib.sleep(2);
  }
  tmux_lib.sleep(SETTLE_S);
  const wentIdle = waitForIdleScreen(session, TURN_TIMEOUT_S);
  if (!wentIdle) {
    throw new Error(`pane ${session.name} did not go idle after the subagent ended`);
  }
}

function findRedUnknownModelLine(session: Session): string | undefined {
  const coloredRun = spawnSync("tmux", ["capture-pane", "-e", "-p", "-t", session.name], { encoding: "utf8" });
  const redMatch = RED_UNKNOWN_MODEL_RE.exec(coloredRun.stdout);
  const plainScreen = coloredRun.stdout.replace(ANSI_RE, "");
  const hasFullRow = UNKNOWN_MODEL_ROW_RE.test(plainScreen);
  const hasRedModel = redMatch !== null;
  const isRedRow = hasRedModel && hasFullRow;
  if (isRedRow) {
    return UNKNOWN_MODEL_ROW_RE.exec(plainScreen)![0];
  }
  return undefined;
}

// Polls the colored pane during the prompt; returns the subagent line if an unknown model id shows red.
function executeRedLineTurn(session: Session, prompt: string): string | undefined {
  clearToIdlePrompt(session);
  tmux_lib.tmux_sendAndSubmit(session.name, prompt + " ");
  let redLine: string | undefined = undefined;
  for (let waited = 0; waited < SUBAGENT_LINE_WAIT_S; waited += 2) {
    redLine = findRedUnknownModelLine(session);
    if (redLine !== undefined) {
      break;
    }
    tmux_lib.sleep(2);
  }
  waitForSubagentLineGone(session);
  return redLine;
}

function listReadPaths(record: JsonRecord): string[] {
  const readPaths: string[] = [];
  const content = record.message?.content;
  const isAssistantWithBlocks = record.type === "assistant" && Array.isArray(content);
  if (!isAssistantWithBlocks) {
    return readPaths;
  }
  for (const block of content) {
    const isRead = block.type === "tool_use" && block.name === "Read";
    if (isRead) {
      readPaths.push(block.input.file_path);
    }
  }
  return readPaths;
}

function containsStateFileRead(record: JsonRecord): boolean {
  for (const readPath of listReadPaths(record)) {
    const isStateFile = readPath.includes("/.idleState/");
    if (isStateFile) {
      return true;
    }
  }
  return false;
}

function findBlockRange(records: JsonRecord[]): [number, number] {
  let firstBlock = -1;
  let lastBlock = -1;
  for (let index = 0; index < records.length; index++) {
    const blockCount = countEvidence([records[index]!], "Before you end your first turn", "Stop");
    if (blockCount > 0) {
      firstBlock = firstBlock === -1 ? index : firstBlock;
      lastBlock = index;
    }
  }
  return [firstBlock, lastBlock];
}

function findLastStateRead(records: JsonRecord[]): number {
  let lastRead = -1;
  for (let index = 0; index < records.length; index++) {
    const hasStateRead = containsStateFileRead(records[index]!);
    if (hasStateRead) {
      lastRead = index;
    }
  }
  return lastRead;
}

function addReaderSubfolderRow(rows: Row[], project: string, records: JsonRecord[], model: string | null): void {
  const idleFolder = path.join(realpathSync(project), ".idleState");
  const readerSnippet = findEvidence(records, `Tell me about the recent work written in the state files ${idleFolder}/`, "UserPromptSubmit");
  addRow(rows, 67, "idle-state (reader subfolder)", model, readerSnippet !== undefined, `session started in src/deep finds the .idleState folder at the repo root: ${readerSnippet !== undefined ? "True" : "False"}`);
}

function addCheckLsRow(rows: Row[], records: JsonRecord[], model: string | null): void {
  const [firstBlock, lastBlock] = findBlockRange(records);
  const lastRead = findLastStateRead(records);
  const notReadSnippet = findEvidence(records, "Not read yet", "Stop");
  const blockedAfterList = firstBlock !== -1 && notReadSnippet !== undefined;
  const passesAfterRead = lastRead > firstBlock && lastBlock < lastRead;
  addRow(rows, 68, "idle-state (check ls)", model, blockedAfterList && passesAfterRead, `an ls that shows the file names does not count as a read: ${blockedAfterList ? "True" : "False"}; stop passes after the Read of the state files: ${passesAfterRead ? "True" : "False"}`);
}

function addSubagentModelRow(rows: Row[], session: Session, bed: string, config: string, model: string | null): void {
  const redLine = executeRedLineTurn(session, UNKNOWN_MODEL_SUBAGENT_PROMPT);
  const settingsPath = path.join(config, "settings.json");
  const statusInterval = readRefreshInterval(settingsPath, "statusLine");
  const subagentInterval = readRefreshInterval(settingsPath, "subagentStatusLine");
  const cloneInterval = readRefreshInterval(path.join(bed, "claude_hooks", "status-line", "hooks.json"), "subagentStatusLine");
  const refreshOk = statusInterval === 1 && subagentInterval === 1 && cloneInterval === 1;
  addRow(rows, 64, "status-line (subagent model)", model, redLine !== undefined && refreshOk, `real subagent on an unknown model id shows the id in red: ${redLine !== undefined ? redLine : "NOT SEEN"}; refreshInterval bed statusLine=${statusInterval} subagentStatusLine=${subagentInterval}, clone subagent=${cloneInterval}`);
}

// Rows 62-64, 67, 68: session two folders below repo root; subagent model unknown to the status line.
export function executeSubfolderSession(rows: Row[], bed: string, config: string): void {
  const project = path.join(bed, "project");
  const deepDir = path.join(project, "src", "deep");
  mkdirSync(deepDir, { recursive: true });
  setEnablement(path.join(bed, "claude_hooks"), "clarify-ambiguous", "UserPromptSubmit", false);
  const session = launchSession(SONNET, bed, config, deepDir, UNKNOWN_MODEL_ID);
  const records = executeFullTurn(session, SUBFOLDER_PROMPT);
  const model = getSessionModel(session);
  addReaderSubfolderRow(rows, project, records, model);
  addCheckLsRow(rows, records, model);
  addSubagentModelRow(rows, session, bed, config, model);
  executePonytailRows(rows, session, bed);
  tmux_lib.tmux_killPane(session.name);
}
