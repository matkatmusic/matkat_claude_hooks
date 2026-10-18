// Stranger test: runs the 41-row hook checklist (14 live rows in tmux, 27 direct rows); the name avoids "test" so test runners skip it.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { executeDirectRows } from "./stranger_direct_rows.ts";

type JsonRecord = Record<string, any>;

interface Session {
  name: string;
  model: string;
  projectsDir: string;
  knownJsonlFiles: Set<string>;
  jsonlPath: string | null;
  bed: string;
}

interface Row {
  number: number;
  hook: string;
  model: string | null;
  ok: boolean;
  evidence: string;
}

type HookRow = [number, string, string, string, string | null];

const REPO = path.resolve(import.meta.dirname, "..");

const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";
const IDLE_MS = 60000;
const IDLE_MARGIN_S = 300;
const SETTLE_S = 15;
const TURN_TIMEOUT_S = 900;
const BUSY_RE = /^\S \w+…|…\s*\(\d+[ms]|esc to interrupt/m;
const TURNS_RE = /(\d+) turns/;
const SUBAGENT_LINE_RE = /\[[^\n]*:\w\] [^\n·]+ · [^\n·]+ · \d+:\d\d · \d\S*/;

// (row, hook, prompt, text the hook must produce, hook event or null for a tool error)
const SESSION_ONE_ROWS: HookRow[] = [
  [4, "block-bash-edits", "Use the Bash tool to run: echo hello > hello.txt", "Use the Edit/Write tools to modify files", null],
  [5, "block-npm-test", "Use the Bash tool to run: npm test", "Test runners are blocked", null],
  [6, "plan-file-reminder", "Write a file plans/test-plan.md that says: step 1.", "Conform the plan you're editing to", "PostToolUse"],
  [7, "nudge-task-list", 'Reply with one sentence that has the words "starting on" in it, then stop.', "You are starting work on a task", "Stop"],
  [8, "unlisted-items", 'Reply with one line only: "next step: build the login page". Do not make any task.', "These items are not on the task list", "Stop"],
];
const SESSION_TWO_ROWS: HookRow[] = [
  [12, "typecheck-on-stop", 'Use the Write tool to create bad.ts with this one line: const x: number = "hello";', "error TS2322", "Stop"],
  [13, "debt-ratchet", "Use the Write tool to create add.ts with a function called add that adds two numbers. No test file.", "Style debt is", "Stop"],
];

function executeCommand(command: string[], cwd?: string, env?: NodeJS.ProcessEnv): void {
  const result = spawnSync(command[0]!, command.slice(1), { cwd, env, stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`command failed with status ${result.status}: ${command.join(" ")}`);
  }
}

function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

function findSnippet(text: string, needle: string): string | undefined {
  const index = text.indexOf(needle);
  if (index === -1) {
    return undefined;
  }
  return text.slice(Math.max(0, index - 30), index + needle.length + 70);
}

function formatOneLine(text: string): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);
  return words.join(" ");
}

function listFilesWithSuffix(directory: string, suffix: string): string[] {
  const files: string[] = [];
  const directoryExists = existsSync(directory);
  if (!directoryExists) {
    return files;
  }
  for (const entry of readdirSync(directory)) {
    const hasSuffix = entry.endsWith(suffix);
    if (hasSuffix) {
      files.push(path.join(directory, entry));
    }
  }
  return files;
}

function getTmuxPane(): string {
  const pane = process.env.TMUX_PANE;
  if (pane === undefined) {
    throw new Error("TMUX_PANE is not set");
  }
  return pane;
}

// ---------- test bed ----------

export function writeEnv(clone: string, bed: string, config: string): void {
  const overrides: Record<string, string> = {
    CLAUDE_HOOKS_PLANNING_GUIDE_PATH: path.join(bed, "planning.md"),
    CLAUDE_HOOKS_TASKS_DIR: `${config}/tasks`,
    CLAUDE_HOOKS_BLOCKED_EDITS_DIR: path.join(bed, "blocked-edits"),
    CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR: path.join(bed, "npm-test-logs"),
    CLAUDE_HOOKS_SESSION_STATE_DIR: path.join(bed, "state"),
    CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: path.join(bed, "array-debt"),
    // CLAUDE_HOOKS_IDLE_STATE_IDLE_MS: String(IDLE_MS), // the idle time is now a constant in the mod: see modifyIdleMinutes
    CLAUDE_HOOKS_BLOCK_NPM_TEST_KILL_AFTER_SECONDS: "3600",
    CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_MAX_AGE_MS: "604800000",
    CLAUDE_HOOKS_BLOCK_NPM_TEST_TEST_TIMEOUT_MS: "120000",
    CLAUDE_HOOKS_CLARIFY_AMBIGUOUS_MAX_WORDS: "15",
    CLAUDE_HOOKS_DEBT_RATCHET_DEBT_TARGET: "0",
    CLAUDE_HOOKS_DEBT_RATCHET_FIX_BATCH_SIZE: "10",
    CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_MAX_AGE_MS: "604800000",
    CLAUDE_HOOKS_DEBT_RATCHET_MAX_FILE_LINES: "150",
    CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS: "86400000",
    CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS: "14",
    CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT: "/tmp",
    CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES: "20",
    CLAUDE_HOOKS_UNLISTED_MIN_SHARED_WORDS: "2",
    CLAUDE_HOOKS_UNLISTED_MIN_WORD_LENGTH: "5",
  };
  const seen = new Set<string>();
  const lines: string[] = [];
  const exampleLines = readFileSync(path.join(clone, ".env.example"), "utf8").split("\n");
  if (exampleLines[exampleLines.length - 1] === "") {
    exampleLines.pop();
  }
  for (let line of exampleLines) {
    const key = line.split("=", 1)[0]!;
    if (key in overrides) {
      line = `${key}=${overrides[key]}`;
      seen.add(key);
    }
    lines.push(line);
  }
  // for (const key of Object.keys(overrides)) {
  //   const isSeen = seen.has(key);
  //   if (!isSeen) {
  //     throw new Error(`.env.example has no ${key} line`);
  //   }
  // }
  for (const key of Object.keys(overrides)) {
    const isSeen = seen.has(key);
    if (!isSeen) {
      lines.push(`${key}=${overrides[key]}`);
    }
  }
  for (const line of lines) {
    const hasEquals = line.includes("=");
    const isComment = line.startsWith("#");
    const isValueLine = hasEquals && !isComment;
    const hasPlaceholder = line.includes("/path/to");
    const isPlaceholderLine = isValueLine && hasPlaceholder;
    if (isPlaceholderLine) {
      throw new Error(`.env still has a placeholder path: ${line}`);
    }
  }
  writeFileSync(path.join(clone, ".env"), lines.join("\n") + "\n");
}

export function modifyIdleMinutes(clone: string): void {
  const registerPath = path.join(clone, "idle-state", "mod", "hooks", "register.ts");
  const source = readFileSync(registerPath, "utf8");
  const original = "const IDLE_MINUTES = 55;";
  const hasOriginal = source.includes(original);
  if (!hasOriginal) {
    throw new Error(`idle-state mod has no line: ${original}`);
  }
  writeFileSync(registerPath, source.replace(original, `const IDLE_MINUTES = ${IDLE_MS / 60000};`));
}

export function enableHooks(clone: string): void {
  const hooksListPath = path.join(clone, "dispatcher", "hooks-list.ts");
  const lines: string[] = [];
  let enabledCount = 0;
  for (let line of readFileSync(hooksListPath, "utf8").split("\n")) {
    const hasImportDirname = line.includes("import.meta.dirname");
    const isDisabled = line.includes("enabled: false");
    const isRealHook = hasImportDirname && isDisabled;
    if (isRealHook) {
      line = line.replace("enabled: false", "enabled: true");
      enabledCount += 1;
    }
    lines.push(line);
  }
  if (enabledCount === 0) {
    throw new Error("no real hook found in hooks-list.ts");
  }
  writeFileSync(hooksListPath, lines.join("\n"));
}

export function createProject(project: string): void {
  mkdirSync(project);
  executeCommand(["git", "init", "-q"], project);
  const packageJson = { name: "stranger-test", type: "module", scripts: { test: "node --test" } };
  writeFileSync(path.join(project, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
  const tsconfig = { compilerOptions: { strict: true, noEmit: true, target: "es2022", module: "nodenext" }, include: ["*.ts"] };
  writeFileSync(path.join(project, "tsconfig.json"), JSON.stringify(tsconfig, null, 2) + "\n");
  writeFileSync(path.join(project, ".gitignore"), "node_modules\n");
  executeCommand(["npm", "install", "-D", "typescript"], project);
  executeCommand(["git", "add", "."], project);
  executeCommand(["git", "-c", "user.name=stranger", "-c", "user.email=stranger@example.com", "commit", "-q", "-m", "init"], project);
}

function writeSettings(config: string, clone: string): void {
  const settingsPath = path.join(config, "settings.json");
  let settings: JsonRecord = {};
  const settingsExist = existsSync(settingsPath);
  if (settingsExist) {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  }
  settings.statusLine = { type: "command", command: `node "${clone}/status-line/status.ts"`, refreshInterval: 3 };
  settings.subagentStatusLine = { type: "command", command: `node "${clone}/status-line/subagentStatusLine.ts"`, refreshInterval: 3 };
  mkdirSync(config, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

function installPlugins(clone: string, config: string): void {
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  const listed = execFileSync("claude", ["plugin", "list"], { env, encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
  const hasPonytail = listed.includes("ponytail@ponytail");
  const hasTypescriptLsp = listed.includes("typescript-lsp@claude-plugins-official");
  const isInstalled = hasPonytail && hasTypescriptLsp;
  if (isInstalled) {
    return;
  }
  executeCommand(["bash", path.join(clone, "install.sh")], undefined, env);
}

function buildBed(bed: string, config: string): void {
  const clone = path.join(bed, "claude_hooks");
  mkdirSync(bed, { recursive: true });
  executeCommand(["git", "clone", "-q", REPO, clone]);
  executeCommand(["npm", "install"], clone);
  writeFileSync(path.join(bed, "planning.md"), "A plan has a goal, steps, and a test for each step.\n");
  writeEnv(clone, bed, config);
  enableHooks(clone);
  modifyIdleMinutes(clone);
  createProject(path.join(bed, "project"));
  writeSettings(config, clone);
  installPlugins(clone, config);
}

// ---------- sessions ----------

function getProjectSlug(project: string): string {
  return realpathSync(project).replace(/[^A-Za-z0-9]/g, "-");
}

function launchSession(model: string, bed: string, config: string): Session {
  const project = path.join(bed, "project");
  const clone = path.join(bed, "claude_hooks");
  const projectsDir = path.join(config, "projects", getProjectSlug(project));
  const whichResult = spawnSync("which", ["claude"], { encoding: "utf8" });
  if (whichResult.status !== 0) {
    throw new Error("claude is not on PATH");
  }
  const claude = whichResult.stdout.trim();
  const script =
    "for v in $(compgen -v | grep -E '^(CLAUDE_HOOKS_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)'); do unset \"$v\"; done; " +
    `set -a; source ${wrapShellWord(path.join(clone, ".env"))}; set +a; cd ${wrapShellWord(project)}; ` +
    `CLAUDE_CONFIG_DIR=${wrapShellWord(config)} exec ${wrapShellWord(claude)} --model ${model} ` +
    `--plugin-dir ${wrapShellWord(clone)} --plugin-dir ${wrapShellWord(path.join(clone, "idle-state", "mod"))}`;
  const pane = tmux_lib.tmux_splitWorkerPane(getTmuxPane(), project, "bash -c " + wrapShellWord(script));
  if (pane === undefined) {
    throw new Error("tmux could not open a pane for Claude");
  }
  const layoutResult = tmux_lib.tmux_selectLayout(pane, "even-horizontal");
  if (layoutResult !== 0) {
    throw new Error("tmux could not put the panes side by side");
  }
  const session: Session = {
    name: pane,
    model,
    projectsDir,
    knownJsonlFiles: new Set(listFilesWithSuffix(projectsDir, ".jsonl")),
    jsonlPath: null,
    bed,
  };
  const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(pane, 120);
  if (readinessCode !== 0) {
    throw new Error(`Claude did not show a prompt in pane ${pane}:\n${tmux_lib.tmux_capturePane(pane)}`);
  }
  tmux_lib.sleep(6);
  return session;
}

function findJsonl(session: Session): string | null {
  if (session.jsonlPath === null) {
    for (const jsonlFile of listFilesWithSuffix(session.projectsDir, ".jsonl")) {
      const isKnown = session.knownJsonlFiles.has(jsonlFile);
      if (!isKnown) {
        session.jsonlPath = jsonlFile;
      }
    }
  }
  return session.jsonlPath;
}

function getJsonlSize(session: Session): number {
  const jsonlPath = findJsonl(session);
  if (jsonlPath === null) {
    return 0;
  }
  return statSync(jsonlPath).size;
}

function readRecords(session: Session): JsonRecord[] {
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

function executeTurn(session: Session, prompt: string, watchRegex?: RegExp): [JsonRecord[], string | undefined] {
  let lastSize = getJsonlSize(session);
  const baselineCount = readRecords(session).length;
  const isJsonlGrowing = (): boolean => {
    const size = getJsonlSize(session);
    const hasGrown = size !== lastSize;
    lastSize = size;
    return hasGrown;
  };
  tmux_lib.tmux_sendAndSubmit(session.name, prompt + " ");
  const watchMatch = tmux_lib.tmux_waitForTurnEnd(session.name, BUSY_RE, SETTLE_S, TURN_TIMEOUT_S, isJsonlGrowing, watchRegex);
  tmux_lib.tmux_capturePaneToFile(session.name, path.join(session.bed, `pane-${session.name}.txt`));
  return [readRecords(session).slice(baselineCount), watchMatch];
}

function getSessionModel(session: Session): string | null {
  let model: string | null = null;
  for (const record of readRecords(session)) {
    const isAssistant = record.type === "assistant";
    const hasModel = isAssistant && Boolean(record.message.model);
    const isAssistantWithModel = isAssistant && hasModel;
    if (isAssistantWithModel) {
      model = record.message.model;
    }
  }
  return model;
}

function validateSessionModel(session: Session, expectedPrefix: string): string {
  const model = getSessionModel(session);
  const hasNoModel = model === null;
  const hasWrongPrefix = model !== null && !model.startsWith(expectedPrefix);
  const isUnexpectedModel = hasNoModel || hasWrongPrefix;
  if (isUnexpectedModel) {
    throw new Error(`session ${session.name} ran model ${model}, expected ${expectedPrefix}*`);
  }
  return model;
}

// ---------- evidence ----------

function collectRecordTexts(record: JsonRecord, event: string | null): string[] {
  const texts: string[] = [];
  if (record.type === "attachment") {
    const attachment = record.attachment;
    const isHook = (attachment.type ?? "").startsWith("hook_");
    const eventMatches = event === null || attachment.hookEvent === event;
    const isMatchingHook = isHook && eventMatches;
    if (isMatchingHook) {
      texts.push(JSON.stringify(attachment));
    }
  }
  const isUserRecord = record.type === "user";
  const isToolErrorQuery = event === null;
  const isUserToolErrorQuery = isUserRecord && isToolErrorQuery;
  if (isUserToolErrorQuery) {
    const content = record.message.content;
    const blocks = Array.isArray(content) ? content : [];
    for (const block of blocks) {
      const isErrorResult = block.type === "tool_result" && block.is_error === true;
      if (isErrorResult) {
        texts.push(JSON.stringify(block.content));
      }
    }
  }
  return texts;
}

function findEvidence(records: JsonRecord[], needle: string, event: string | null = null): string | undefined {
  for (const record of records) {
    for (const text of collectRecordTexts(record, event)) {
      const found = findSnippet(text, needle);
      if (found !== undefined) {
        return found;
      }
    }
  }
  return undefined;
}

function addRow(rows: Row[], number: number, hook: string, model: string | null, ok: boolean, evidence: string): void {
  rows.push({ number, hook, model, ok, evidence: formatOneLine(evidence) });
}

function addHookRow(rows: Row[], session: Session, number: number, hook: string, records: JsonRecord[], needle: string, event: string | null): void {
  const found = findEvidence(records, needle, event);
  const evidence = found !== undefined ? found : `no hook record with: ${needle}`;
  addRow(rows, number, hook, getSessionModel(session), found !== undefined, evidence);
}

function compareRowNumbers(a: Row, b: Row): number {
  return a.number - b.number;
}

function printTable(rows: Row[]): void {
  console.log(`${"#".padEnd(3)} ${"hook".padEnd(24)} ${"model".padEnd(22)} ${"result".padEnd(6)} evidence`);
  const sortedRows = [...rows].sort(compareRowNumbers);
  for (const row of sortedRows) {
    const result = row.ok ? "PASS" : "FAIL";
    const model = row.model === null ? "None" : row.model;
    console.log(`${String(row.number).padEnd(3)} ${row.hook.padEnd(24)} ${model.padEnd(22)} ${result.padEnd(6)} ${row.evidence.slice(0, 110)}`);
  }
}

// ---------- the checklist ----------

function getPaneTurns(name: string): number | null {
  const found = TURNS_RE.exec(tmux_lib.tmux_capturePane(name));
  if (found === null) {
    return null;
  }
  return Number(found[1]);
}

function executeFirstSession(rows: Row[], bed: string, config: string): Session {
  const session = launchSession(SONNET, bed, config);
  const name = session.name;
  const turnsBefore = getPaneTurns(name);
  executeTurn(session, "say hi");
  validateSessionModel(session, "claude-sonnet-5");
  addHookRow(rows, session, 1, "check-task-list-id", readRecords(session), "CLAUDE_CODE_TASK_LIST_ID is not set", "SessionStart");
  tmux_lib.sleep(6);
  const turnsAfter = getPaneTurns(name);
  const startedAtZero = turnsBefore === 0;
  const hasTurnsAfter = turnsAfter !== null && turnsAfter >= 1;
  const statusLineOk = startedAtZero && hasTurnsAfter;
  addRow(rows, 2, "status-line", getSessionModel(session), statusLineOk, `turns on screen: before=${turnsBefore} after=${turnsAfter}`);

  const [, subagentLine] = executeTurn(session, "Start one subagent that lists the files in this folder.", SUBAGENT_LINE_RE);
  addRow(rows, 3, "status-line (subagent)", getSessionModel(session), subagentLine !== undefined, subagentLine !== undefined ? subagentLine : "no subagent line seen on screen");

  for (const [number, hook, prompt, needle, event] of SESSION_ONE_ROWS) {
    const [records] = executeTurn(session, prompt);
    addHookRow(rows, session, number, hook, records, needle, event);
    if (number === 5) {
      const logFiles = listFilesWithSuffix(path.join(bed, "npm-test-logs"), "");
      const lastRow = rows[rows.length - 1]!;
      lastRow.ok = lastRow.ok && logFiles.length > 0;
      lastRow.evidence += ` | log files: ${logFiles.length}`;
    }
  }
  return session;
}

function executeSecondSession(rows: Row[], bed: string, config: string): Session {
  const project = path.join(bed, "project");
  const session = launchSession(SONNET, bed, config);
  const [helloRecords] = executeTurn(session, "hello");
  validateSessionModel(session, "claude-sonnet-5");
  addHookRow(rows, session, 10, "ponytail-ultra-nudge", helloRecords, "Ponytail ultra has not been invoked yet", "UserPromptSubmit");

  const [fixItRecords] = executeTurn(session, "fix it");
  const gateFound = findEvidence(fixItRecords, "AMBIGUITY GATE", "UserPromptSubmit");
  const [fixItJdiRecords] = executeTurn(session, "fix it jdi");
  const gateInOptOut = findEvidence(fixItJdiRecords, "AMBIGUITY GATE", "UserPromptSubmit");
  const clarifyOk = gateFound !== undefined && gateInOptOut === undefined;
  addRow(rows, 11, "clarify-ambiguous", getSessionModel(session), clarifyOk, `gate on 'fix it': ${gateFound !== undefined ? "True" : "False"}; gate on 'fix it jdi': ${gateInOptOut !== undefined ? "True" : "False"}`);

  for (const [number, hook, prompt, needle, event] of SESSION_TWO_ROWS) {
    const [records] = executeTurn(session, prompt);
    addHookRow(rows, session, number, hook, records, needle, event);
    rmSync(path.join(project, "bad.ts"), { force: true });
    rmSync(path.join(project, "add.ts"), { force: true });
    rmSync(path.join(project, "add.test.ts"), { force: true });
  }

  executeTurn(session, "say hi");
  return session;
}

function executeThirdSession(rows: Row[], bed: string, config: string, second: Session, stateFiles: string[], hasExited: boolean): Session {
  const session = launchSession(OPUS, bed, config);
  const [records] = executeTurn(session, "Create a file note.txt that says hi.");
  const model = validateSessionModel(session, "claude-opus-5");
  const found = findEvidence(records, "Parent session must not edit files");
  const blockedFiles = listFilesWithSuffix(path.join(bed, "blocked-edits"), ".json");
  const blockOk = found !== undefined && blockedFiles.length > 0;
  addRow(rows, 15, "block-parent-edits", model, blockOk, `${found !== undefined ? found : "None"}; saved calls: ${blockedFiles.length}`);

  const readerFound = findEvidence(readRecords(session), "Tell me about the recent work", "SessionStart");
  const idleOk = stateFiles.length > 0 && hasExited && readerFound !== undefined;
  addRow(rows, 14, "idle-state", getSessionModel(second), idleOk, `state files: ${stateFiles.length}; claude exited: ${hasExited ? "True" : "False"}; next start context: ${readerFound !== undefined ? "True" : "False"}`);
  return session;
}

async function executeMain(): Promise<void> {
  if (process.env.TMUX_PANE === undefined) {
    const argumentWords: string[] = [];
    for (const argument of process.argv.slice(2)) {
      argumentWords.push(wrapShellWord(argument));
    }
    const command = ["BUN_JSC_useTailCalls=0", wrapShellWord(process.execPath), wrapShellWord(import.meta.filename), ...argumentWords].join(" ") + "; read";
    // const result = spawnSync("tmux", ["new-session", "-s", "stranger-test", "-x", "200", "-y", "60", command, ";", "set-option", "-w", "window-size", "manual"], { stdio: "inherit" });
    const result = spawnSync("tmux", ["new-session", "-s", "stranger-test", "-x", "200", "-y", "60", command], { stdio: "inherit" });
    process.exit(result.status ?? 1);
  }
  const { values } = parseArgs({ options: { bed: { type: "string" }, config: { type: "string" } } });
  if (values.bed === undefined) {
    throw new Error("--bed is required: new folder for the test bed");
  }
  if (values.config === undefined) {
    throw new Error("--config is required: signed-in Claude config folder");
  }
  const bed = path.resolve(values.bed);
  const config = path.resolve(values.config);
  const rows: Row[] = [];
  try {
    buildBed(bed, config);
    for (const result of await executeDirectRows(bed, config)) {
      addRow(rows, result.number, result.hook, null, result.ok, result.evidence);
    }
    const first = executeFirstSession(rows, bed, config);
    tmux_lib.tmux_killPane(first.name);
    const second = executeSecondSession(rows, bed, config);
    const hasExited = tmux_lib.tmux_waitForPaneClose(second.name, IDLE_MS / 1000 + IDLE_MARGIN_S);
    const stateFiles = listFilesWithSuffix(path.join(bed, "project", ".idleState"), ".json");
    executeThirdSession(rows, bed, config, second, stateFiles, hasExited);
  }
  finally {
    tmux_lib.tmux_killOtherPanes(getTmuxPane());
    printTable(rows);
  }
  let allPassed = true;
  for (const row of rows) {
    if (!row.ok) {
      allPassed = false;
    }
  }
  process.exit(allPassed ? 0 : 1);
}

if (import.meta.main) {
  await executeMain();
}
