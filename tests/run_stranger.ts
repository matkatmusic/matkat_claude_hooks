// Stranger test: 58 hook rows, 40 live in tmux and 18 direct; run with bun.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { buildBed } from "./stranger_bed.ts";
import { IDLE_MARGIN_S, IDLE_MS, IDLE_PROGRAM_PATTERN, type Row } from "./stranger_constants.ts";
import { addRow, printTable } from "./stranger_evidence.ts";
import { executeExitRows, executeStopFailureRow } from "./stranger_exit.ts";
import { executeFirstSession } from "./stranger_first.ts";
import { executeDirectRows } from "./stranger_direct_rows.ts";
import { getTmuxPane, listFilesWithSuffix, wrapShellWord } from "./stranger_helpers.ts";
import { addIdleProgramRow, executeSecondSession } from "./stranger_second.ts";
import { executeSubfolderSession } from "./stranger_subfolder.ts";
import { executeParentFilesRow, executeThirdSession } from "./stranger_third.ts";

function launchInTmux(): never {
  const argumentWords: string[] = [];
  for (const argument of process.argv.slice(2)) {
    argumentWords.push(wrapShellWord(argument));
  }
  const command = ["BUN_JSC_useTailCalls=0", wrapShellWord(process.execPath), wrapShellWord(import.meta.filename), ...argumentWords].join(" ") + "; read";
  const result = spawnSync("tmux", ["new-session", "-s", "stranger-test", "-x", "200", "-y", "60", command], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function parseBedAndConfig(): [string, string] {
  const { values } = parseArgs({ options: { bed: { type: "string" }, config: { type: "string" } } });
  if (values.bed === undefined) {
    throw new Error("--bed is required: new folder for the test bed");
  }
  if (values.config === undefined) {
    throw new Error("--config is required: signed-in Claude config folder");
  }
  return [path.resolve(values.bed), path.resolve(values.config)];
}

function executeLiveRows(rows: Row[], bed: string, config: string): void {
  buildBed(bed, config);
  const first = executeFirstSession(rows, bed, config);
  tmux_lib.tmux_killPane(first.name);
  const second = executeSecondSession(rows, bed, config);
  const hasExited = tmux_lib.tmux_waitForPaneClose(second.name, IDLE_MS / 1000 + IDLE_MARGIN_S);
  const stateFiles = listFilesWithSuffix(path.join(bed, "project", ".idleState"), ".json");
  addIdleProgramRow(rows, second, stateFiles);
  const third = executeThirdSession(rows, bed, config, second, stateFiles, hasExited);
  executeParentFilesRow(rows, third, bed);
  executeExitRows(rows, third, bed);
  executeSubfolderSession(rows, bed, config);
  executeStopFailureRow(rows, bed, config);
}

function closeTest(rows: Row[]): void {
  spawnSync("pkill", ["-f", IDLE_PROGRAM_PATTERN]);
  tmux_lib.tmux_killOtherPanes(getTmuxPane());
  printTable(rows);
}

async function executeAllRows(rows: Row[], bed: string, config: string): Promise<void> {
  try {
    executeLiveRows(rows, bed, config);
    for (const result of await executeDirectRows(bed, config)) {
      addRow(rows, result.number, result.hook, null, result.ok, result.evidence);
    }
  }
  finally {
    closeTest(rows);
  }
}

function containsFailedRow(rows: Row[]): boolean {
  for (const row of rows) {
    if (!row.ok) {
      return true;
    }
  }
  return false;
}

async function executeMain(): Promise<void> {
  if (process.env.TMUX_PANE === undefined) {
    launchInTmux();
  }
  const [bed, config] = parseBedAndConfig();
  const rows: Row[] = [];
  await executeAllRows(rows, bed, config);
  const hasFailedRow = containsFailedRow(rows);
  process.exit(hasFailedRow ? 1 : 0);
}

if (import.meta.main) {
  await executeMain();
}
