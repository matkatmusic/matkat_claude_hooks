import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { BUSY_RE, CLEAR_ATTEMPTS, type JsonRecord, type Session } from "./stranger_constants.ts";
import { getTmuxPane, listFilesWithSuffix, wrapShellWord } from "./stranger_helpers.ts";

function getProjectSlug(project: string): string {
  return realpathSync(project).replace(/[^A-Za-z0-9]/g, "-");
}

function findClaudePath(): string {
  const whichResult = spawnSync("which", ["claude"], { encoding: "utf8" });
  if (whichResult.status !== 0) {
    throw new Error("claude is not on PATH");
  }
  return whichResult.stdout.trim();
}

function buildLaunchScript(model: string, bed: string, config: string, workDir: string, subagentModel: string | null, sessionId: string): string {
  const clone = path.join(bed, "claude_hooks");
  const subagentModelAssignment = subagentModel === null ? "" : `CLAUDE_CODE_SUBAGENT_MODEL=${subagentModel} `;
  const claude = findClaudePath();
  return "for v in $(compgen -v | grep -E '^(CLAUDE_HOOKS_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)'); do unset \"$v\"; done; " +
    `cd ${wrapShellWord(workDir)}; ` +
    `CLAUDE_CONFIG_DIR=${wrapShellWord(config)} CLAUDE_CODE_ENABLE_TODO_TOOLS=1 ${subagentModelAssignment}exec ${wrapShellWord(claude)} --model ${model} --session-id ${sessionId} ` +
    `--plugin-dir ${wrapShellWord(clone)} --plugin-dir ${wrapShellWord(path.join(clone, "idle-state", "mod"))} ` +
    `--plugin-dir ${wrapShellWord(path.join(clone, "context-exit", "mod"))} --plugin-dir ${wrapShellWord(path.join(clone, "ask-dont-dump", "mod"))}`;
}

function openClaudePane(workDir: string, script: string): string {
  const pane = tmux_lib.tmux_splitWorkerPane(getTmuxPane(), workDir, "bash -c " + wrapShellWord(script));
  if (pane === undefined) {
    throw new Error("tmux could not open a pane for Claude");
  }
  const layoutResult = tmux_lib.tmux_selectLayout(pane, "even-horizontal");
  if (layoutResult !== 0) {
    throw new Error("tmux could not put the panes side by side");
  }
  return pane;
}

function waitForClaudePrompt(pane: string): void {
  const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(pane, 120);
  if (readinessCode !== 0) {
    throw new Error(`Claude did not show a prompt in pane ${pane}:\n${tmux_lib.tmux_capturePane(pane)}`);
  }
  tmux_lib.sleep(6);
}

export function launchSession(model: string, bed: string, config: string, workDir: string = path.join(bed, "project"), subagentModel: string | null = null): Session {
  const projectsDir = path.join(config, "projects", getProjectSlug(workDir));
  const sessionId = randomUUID();
  const script = buildLaunchScript(model, bed, config, workDir, subagentModel, sessionId);
  const pane = openClaudePane(workDir, script);
  const knownJsonlFiles = new Set(listFilesWithSuffix(projectsDir, ".jsonl"));
  const session: Session = { name: pane, id: sessionId, model, projectsDir, knownJsonlFiles, jsonlPath: null, bed };
  waitForClaudePrompt(pane);
  return session;
}

// The session id is fixed at launch, so helper sessions of the hooks never get picked by mistake.
function findJsonl(session: Session): string | null {
  if (session.jsonlPath === null) {
    const expectedPath = path.join(session.projectsDir, `${session.id}.jsonl`);
    const hasExpectedFile = existsSync(expectedPath);
    if (hasExpectedFile) {
      session.jsonlPath = expectedPath;
    }
  }
  return session.jsonlPath;
}

export function getJsonlSize(session: Session): number {
  const jsonlPath = findJsonl(session);
  if (jsonlPath === null) {
    return 0;
  }
  return statSync(jsonlPath).size;
}

export function readRecords(session: Session): JsonRecord[] {
  const jsonlPath = findJsonl(session);
  if (jsonlPath === null) {
    return [];
  }
  const allLines = readFileSync(jsonlPath, "utf8").split("\n");
  const completeLines = allLines.slice(0, -1);
  const records: JsonRecord[] = [];
  for (const line of completeLines) {
    records.push(JSON.parse(line));
  }
  return records;
}

export function isScreenIdle(screen: string): boolean {
  const isBusy = BUSY_RE.test(screen);
  const hasDialog = screen.includes("Esc to cancel");
  const hasPrompt = screen.includes("❯");
  return hasPrompt && !isBusy && !hasDialog;
}

// Presses Escape until no turn runs and no dialog is open; throws if the pane never gets idle.
export function clearToIdlePrompt(session: Session): void {
  for (let attempt = 0; attempt < CLEAR_ATTEMPTS; attempt++) {
    const screen = tmux_lib.tmux_capturePane(session.name);
    const isIdle = isScreenIdle(screen);
    if (isIdle) {
      return;
    }
    tmux_lib.tmux_sendKeys(session.name, "Escape");
    tmux_lib.sleep(2);
  }
  throw new Error(`pane ${session.name} did not return to an idle prompt:\n${tmux_lib.tmux_capturePane(session.name)}`);
}
