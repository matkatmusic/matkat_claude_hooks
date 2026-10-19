// Stranger test: 47 hook rows, 22 live in tmux and 25 direct; run with bun.
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { executeDirectRows } from "./stranger_direct_rows.ts";

type JsonRecord = Record<string, any>;

interface Session {
  name: string;
  id: string;
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
const CLEAR_ATTEMPTS = 12;
const PROMPT_WAIT_S = 60;
const HOOK_FLUSH_S = 4;
const BUSY_RE = /^\S \w+…|…\s*\(\d+[ms]|esc to interrupt/m;
const TURNS_RE = /(\d+) turns/;
const SUBAGENT_LINE_RE = /\[[^\n]*:\w\] [^\n·]+ · [^\n·]+ · \d+:\d\d · \d\S*/;
const CONTEXT_PERCENT_RE = /(\d+)% \| 🔄/;
const CONTEXT_WARNING_RE = /above (\d+)%/;
const TOAST_BOX_RE = /│ context-exit\s+│/;
const CONTEXT_LEVEL_SPACING = 3;
const FILLER_FILES = 12;
const FILLER_LINES = 700;
const FILLER_COLUMNS = 8;
const TOAST_GONE_WAIT_S = 90;
const TOAST_POLL_S = 3;
const CHECKER_WAIT_S = 20;
const ASK_DONT_DUMP_PROMPT = "Name the files in this folder in one short line. Then end your reply with this last line: Task #20 is still open.";
const IDLE_PROGRAM_SCRIPT = "server+80.sh";
const IDLE_PROGRAM_PATTERN = "server\\+80\\.sh";
const TASK_LIST_ID_MESSAGE = "CLAUDE_CODE_TASK_LIST_ID is not set";
const NOT_WIRED_TEXT = "turn-counter hook is not wired";
const TURN_COUNTER_EVENTS = ["SessionStart", "Stop", "StopFailure", "SessionEnd"];
const PROMPT_FILES = ["hello.txt", "plans/test-plan.md", "bad.ts", "add.ts", "add.test.ts", "note.txt"];

const REMAKE_ROWS = [4, 6, 12, 13, 15];
const REMAKE_NOTE = "The file was deleted since you made it, so make it again: ";

type TurnRunner = (session: Session, prompt: string) => JsonRecord[];

// (row, hook, prompt, text the hook must produce, hook event or null for a tool error)
const SESSION_ONE_ROWS: HookRow[] = [
  [4, "block-bash-edits", "Use the Bash tool to run: echo hello > hello.txt", "Use the Edit/Write tools to modify files", null],
  [5, "block-npm-test", "Use the Bash tool to run: npm test", "Test runners are blocked", null],
  [6, "plan-file-reminder", "Write a file plans/test-plan.md that says: step 1.", "Conform the plan you're editing to", "PostToolUse"],
  [7, "nudge-task-list", 'Reply with one sentence that has the words "starting on" in it, then stop.', "You are starting work on a task", "Stop"],
  [8, "unlisted-items", 'Reply with one line only: "next step: build the login page". Do not make any task.', "These items are not on the task list", "Stop"],
];
const PONYTAIL_ROW: HookRow = [10, "ponytail-ultra-nudge", "hello", "Ponytail ultra has not been invoked yet", "UserPromptSubmit"];
const CLARIFY_ROW: HookRow = [11, "clarify-ambiguous", "fix it", "AMBIGUITY GATE", "UserPromptSubmit"];
const PARENT_ROW: HookRow = [15, "block-parent-edits", "Create a file note.txt that says hi.", "Parent session must not edit files", null];
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

export function writeUserDispatch(clone: string, bed: string, config: string): void {
  const enablements: Record<string, Record<string, boolean>> = {
    "block-npm-test": { PreToolUse: true },
    "block-parent-edits": { PreToolUse: true },
    "block-bash-edits": { PreToolUse: true },
    "plan-file-reminder": { PostToolUse: true },
    "check-task-list-id": { SessionStart: true },
    "nudge-task-list": { Stop: true },
    "unlisted-items": { Stop: true },
    "turn-counter": { SessionStart: true, Stop: true, StopFailure: true, SessionEnd: true },
    "ponytail-ultra-nudge": { UserPromptSubmit: true },
    "clarify-ambiguous": { UserPromptSubmit: true },
    "typecheck-on-stop": { Stop: true, SubagentStop: true },
    "debt-ratchet": { Stop: true, SubagentStop: true },
    "idle-state-reader": { UserPromptSubmit: true },
    "idle-state-check": { Stop: true },
    // turn.complete starts off: its follow-up dialog stalls the other rows; row 45 turns it on.
    "ask-dont-dump": { "prompt.submit": true, "turn.complete": false },
    "idle-state": { "session.start": true, "session.end": true, "prompt.submit": true, "turn.complete": true, "tool.call": true, "command.run": true },
    "context-exit": { "turn.complete": true },
  };
  const values: Record<string, Record<string, string>> = {
    shared: { CLAUDE_HOOKS_SESSION_STATE_DIR: path.join(bed, "state") },
    "plan-file-reminder": { CLAUDE_HOOKS_PLANNING_GUIDE_PATH: path.join(bed, "planning.md") },
    "unlisted-items": { CLAUDE_HOOKS_TASKS_DIR: `${config}/tasks` },
    "block-parent-edits": { CLAUDE_HOOKS_BLOCKED_EDITS_DIR: path.join(bed, "blocked-edits") },
    "block-npm-test": { CLAUDE_HOOKS_BLOCK_NPM_TEST_LOG_DIR: path.join(bed, "npm-test-logs") },
    "debt-ratchet": { CLAUDE_HOOKS_DEBT_RATCHET_LEDGER_DIR: path.join(bed, "array-debt") },
    "idle-state": { CLAUDE_HOOKS_IDLE_MINUTES: String(IDLE_MS / 60000) },
    "context-exit": { CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS: "30,50,80" },
  };
  writeFileSync(path.join(clone, "dispatcher", "user-dispatch.json"), JSON.stringify({ enablements, values }, null, 2) + "\n");
}

export function setEnablement(clone: string, hook: string, event: string, on: boolean): void {
  const userDispatchPath = path.join(clone, "dispatcher", "user-dispatch.json");
  const userDispatch = JSON.parse(readFileSync(userDispatchPath, "utf8"));
  userDispatch.enablements[hook][event] = on;
  writeFileSync(userDispatchPath, JSON.stringify(userDispatch, null, 2) + "\n");
}

export function setValue(clone: string, section: string, key: string, value: string): void {
  const userDispatchPath = path.join(clone, "dispatcher", "user-dispatch.json");
  const userDispatch = JSON.parse(readFileSync(userDispatchPath, "utf8"));
  userDispatch.values[section][key] = value;
  writeFileSync(userDispatchPath, JSON.stringify(userDispatch, null, 2) + "\n");
}

// Disabled: the idle minutes now come from user-dispatch.json values (see writeUserDispatch).
// export function modifyIdleMinutes(clone: string): void {
//   const registerPath = path.join(clone, "idle-state", "mod", "hooks", "register.ts");
//   const source = readFileSync(registerPath, "utf8");
//   const original = "const IDLE_MINUTES = 55;";
//   const hasOriginal = source.includes(original);
//   if (!hasOriginal) {
//     throw new Error(`idle-state mod has no line: ${original}`);
//   }
//   writeFileSync(registerPath, source.replace(original, `const IDLE_MINUTES = ${IDLE_MS / 60000};`));
// }

function copyUncommittedChanges(clone: string): void {
  const patch = execFileSync("git", ["diff", "HEAD", "--binary"], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
  execFileSync("git", ["apply", "--allow-empty"], { cwd: clone, input: patch });
}

export function copyUntrackedFiles(repo: string, clone: string): void {
  const listing = execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: repo, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  for (const relativePath of listing.split("\0")) {
    if (relativePath === "")
      continue;
    const target = path.join(clone, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(repo, relativePath), target);
  }
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
  copyUncommittedChanges(clone);
  copyUntrackedFiles(REPO, clone);
  executeCommand(["npm", "install"], clone);
  writeFileSync(path.join(bed, "planning.md"), "A plan has a goal, steps, and a test for each step.\n");
  writeUserDispatch(clone, bed, config);
  // modifyIdleMinutes(clone);
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
  const sessionId = randomUUID();
  const script =
    "for v in $(compgen -v | grep -E '^(CLAUDE_HOOKS_|CLAUDE_CODE_|CLAUDECODE$|CLAUDE_PID$|CLAUDE_EFFORT$)'); do unset \"$v\"; done; " +
    `cd ${wrapShellWord(project)}; ` +
    `CLAUDE_CONFIG_DIR=${wrapShellWord(config)} exec ${wrapShellWord(claude)} --model ${model} --session-id ${sessionId} ` +
    `--plugin-dir ${wrapShellWord(clone)} --plugin-dir ${wrapShellWord(path.join(clone, "idle-state", "mod"))} ` +
    `--plugin-dir ${wrapShellWord(path.join(clone, "context-exit", "mod"))} --plugin-dir ${wrapShellWord(path.join(clone, "ask-dont-dump", "mod"))}`;
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
    id: sessionId,
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

// The session id is fixed at launch, so helper sessions of the hooks never get picked by mistake.
function findJsonl(session: Session): string | null {
  if (session.jsonlPath === null) {
    const expectedPath = path.join(session.projectsDir, `${session.id}.jsonl`);
    const hasExpectedFile = existsSync(expectedPath);
    if (hasExpectedFile) {
      session.jsonlPath = expectedPath;
    }
    // for (const jsonlFile of listFilesWithSuffix(session.projectsDir, ".jsonl")) {
    //   const isKnown = session.knownJsonlFiles.has(jsonlFile);
    //   if (!isKnown) {
    //     session.jsonlPath = jsonlFile;
    //   }
    // }
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

function isScreenIdle(screen: string): boolean {
  const isBusy = BUSY_RE.test(screen);
  const hasDialog = screen.includes("Esc to cancel");
  const hasPrompt = screen.includes("❯");
  return hasPrompt && !isBusy && !hasDialog;
}

// Presses Escape until no turn runs and no dialog is open; throws if the pane never gets idle.
function clearToIdlePrompt(session: Session): void {
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

function containsPromptRecord(records: JsonRecord[], prompt: string): boolean {
  for (const record of records) {
    const isUser = record.type === "user";
    const isMeta = record.isMeta === true;
    const isTypedPrompt = isUser && !isMeta;
    if (!isTypedPrompt) {
      continue;
    }
    const content = record.message.content;
    if (typeof content === "string") {
      const hasText = content.includes(prompt);
      if (hasText) {
        return true;
      }
      continue;
    }
    for (const block of content) {
      const hasText = block.type === "text" && block.text.includes(prompt);
      if (hasText) {
        return true;
      }
    }
  }
  return false;
}

function validatePromptRecorded(session: Session, records: JsonRecord[], prompt: string): void {
  const isRecorded = containsPromptRecord(records, prompt);
  if (!isRecorded) {
    throw new Error(`prompt was not recorded as a user message in session ${session.name}: ${prompt}\n${tmux_lib.tmux_capturePane(session.name)}`);
  }
}

// Sends a prompt, waits for its user record and hook records, then interrupts the turn it started.
function executePromptOnlyTurn(session: Session, prompt: string): JsonRecord[] {
  clearToIdlePrompt(session);
  const baselineCount = readRecords(session).length;
  tmux_lib.tmux_sendAndSubmit(session.name, prompt + " ");
  for (let second = 0; second < PROMPT_WAIT_S; second++) {
    const records = readRecords(session).slice(baselineCount);
    const isRecorded = containsPromptRecord(records, prompt);
    if (isRecorded) {
      tmux_lib.sleep(HOOK_FLUSH_S);
      const settledRecords = readRecords(session).slice(baselineCount);
      clearToIdlePrompt(session);
      return settledRecords;
    }
    tmux_lib.sleep(1);
  }
  validatePromptRecorded(session, readRecords(session).slice(baselineCount), prompt);
  return [];
}

function executeTurn(session: Session, prompt: string, watchRegex?: RegExp): [JsonRecord[], string | undefined] {
  clearToIdlePrompt(session);
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
  const turnRecords = readRecords(session).slice(baselineCount);
  validatePromptRecorded(session, turnRecords, prompt);
  return [turnRecords, watchMatch];
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

function executeFullTurn(session: Session, prompt: string): JsonRecord[] {
  const [records] = executeTurn(session, prompt);
  return records;
}

function removePromptFiles(bed: string): void {
  for (const promptFile of PROMPT_FILES) {
    rmSync(path.join(bed, "project", promptFile), { force: true });
  }
}

// Same prompt twice: hook off must show no message, hook on must show it. Returns the added row.
function executeOffOnPair(rows: Row[], session: Session, bed: string, hookRow: HookRow, runTurn: TurnRunner): Row {
  const [number, hook, prompt, needle, event] = hookRow;
  const clone = path.join(bed, "claude_hooks");
  const enablementEvent = event ?? "PreToolUse";
  setEnablement(clone, hook, enablementEvent, false);
  const offRecords = runTurn(session, prompt);
  const offFound = findEvidence(offRecords, needle, event);
  removePromptFiles(bed);
  setEnablement(clone, hook, enablementEvent, true);
  const remakesFile = REMAKE_ROWS.includes(number);
  const onPrompt = remakesFile ? REMAKE_NOTE + prompt : prompt;
  const onRecords = runTurn(session, onPrompt);
  const onFound = findEvidence(onRecords, needle, event);
  const switchOk = offFound === undefined && onFound !== undefined;
  addRow(rows, number, hook, getSessionModel(session), switchOk, `hook off: message ${offFound === undefined ? "absent" : "PRESENT"}; hook on: message ${onFound !== undefined ? "present" : "ABSENT"}: ${onFound !== undefined ? onFound : ""}`);
  return rows[rows.length - 1]!;
}

function getPaneTurns(name: string): number | null {
  const found = TURNS_RE.exec(tmux_lib.tmux_capturePane(name));
  if (found === null) {
    return null;
  }
  return Number(found[1]);
}

function getPaneContextPercent(name: string): number {
  const found = CONTEXT_PERCENT_RE.exec(tmux_lib.tmux_capturePane(name));
  if (found === null) {
    throw new Error(`no context percent on the screen of pane ${name}`);
  }
  return Number(found[1]);
}

// The context-exit mod keeps its latest warning on the status line, so the screen shows the last level.
function readWarningLevel(screen: string): number | null {
  for (const line of screen.split("\n")) {
    const isWarningLine = line.includes("context-exit:");
    if (!isWarningLine) {
      continue;
    }
    const found = CONTEXT_WARNING_RE.exec(line);
    if (found !== null) {
      return Number(found[1]);
    }
  }
  return null;
}

function createFillerWord(fileIndex: number, line: number, column: number): string {
  let number = (line * 7919 + column * 104729 + fileIndex * 1000003 + 12345) % 11881376;
  let word = "";
  for (let letter = 0; letter < 5; letter++) {
    word += String.fromCharCode(97 + (number % 26));
    number = Math.floor(number / 26);
  }
  return word;
}

function writeFillerFiles(project: string): void {
  for (let fileIndex = 1; fileIndex <= FILLER_FILES; fileIndex++) {
    let text = "";
    for (let line = 0; line < FILLER_LINES; line++) {
      const words: string[] = [];
      for (let column = 0; column < FILLER_COLUMNS; column++) {
        words.push(createFillerWord(fileIndex, line, column));
      }
      text += words.join(" ") + "\n";
    }
    writeFileSync(path.join(project, `filler${fileIndex}.txt`), text);
  }
}

function waitForToastGone(name: string): void {
  for (let waited = 0; waited < TOAST_GONE_WAIT_S; waited += TOAST_POLL_S) {
    const hasToast = TOAST_BOX_RE.test(tmux_lib.tmux_capturePane(name));
    if (!hasToast) {
      return;
    }
    tmux_lib.sleep(TOAST_POLL_S);
  }
  throw new Error(`the context-exit toast stayed on the screen of pane ${name}`);
}

// Row 43: set three levels just above the current context percent, then read files until each level warns once.
function executeContextExitRow(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  writeFillerFiles(path.join(bed, "project"));
  setEnablement(clone, "idle-state", "turn.complete", false);
  // Off then on with a level equal to the current percent: no warning first, then a toast.
  waitForToastGone(session.name);
  const pairPercent = getPaneContextPercent(session.name);
  const levelBeforePair = readWarningLevel(tmux_lib.tmux_capturePane(session.name));
  setEnablement(clone, "context-exit", "turn.complete", false);
  setValue(clone, "context-exit", "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS", String(pairPercent));
  executeTurn(session, "say hi");
  const offScreen = tmux_lib.tmux_capturePane(session.name);
  const hasOffToast = TOAST_BOX_RE.test(offScreen);
  const hasOffLevelChange = readWarningLevel(offScreen) !== levelBeforePair;
  const hasOffMessage = hasOffToast || hasOffLevelChange;
  setEnablement(clone, "context-exit", "turn.complete", true);
  executeTurn(session, "say hi");
  const hasOnMessage = TOAST_BOX_RE.test(tmux_lib.tmux_capturePane(session.name));
  waitForToastGone(session.name);
  const switchOk = !hasOffMessage && hasOnMessage;
  const startPercent = getPaneContextPercent(session.name);
  const levels: number[] = [];
  for (let step = 1; step <= 3; step++) {
    levels.push(startPercent + step * CONTEXT_LEVEL_SPACING);
  }
  setValue(clone, "context-exit", "CLAUDE_HOOKS_CONTEXT_EXIT_WARNING_PERCENTS", levels.join(","));
  const seenLevels: number[] = [];
  let lastShown = readWarningLevel(tmux_lib.tmux_capturePane(session.name));
  let fillerIndex = 0;
  let toastOnEachCrossing = true;
  let noRepeat = true;
  for (const level of levels) {
    let hasCrossed = false;
    while (!hasCrossed) {
      fillerIndex++;
      if (fillerIndex > FILLER_FILES) {
        throw new Error(`context-exit: ${FILLER_FILES} filler files did not reach level ${level}`);
      }
      executeTurn(session, `Read the file filler${fillerIndex}.txt in this folder and reply with only the word read.`);
      const screen = tmux_lib.tmux_capturePane(session.name);
      const shown = readWarningLevel(screen);
      hasCrossed = shown !== lastShown;
      if (hasCrossed) {
        seenLevels.push(shown!);
        lastShown = shown;
        const hasToast = TOAST_BOX_RE.test(screen);
        toastOnEachCrossing = toastOnEachCrossing && hasToast;
      }
    }
    waitForToastGone(session.name);
    executeTurn(session, "say hi");
    const laterScreen = tmux_lib.tmux_capturePane(session.name);
    const hasNewToast = TOAST_BOX_RE.test(laterScreen);
    const levelChanged = readWarningLevel(laterScreen) !== lastShown;
    noRepeat = noRepeat && !hasNewToast && !levelChanged;
  }
  setEnablement(clone, "idle-state", "turn.complete", true);
  const isInOrder = seenLevels.join(",") === levels.join(",");
  const ok = isInOrder && toastOnEachCrossing && noRepeat && switchOk;
  addRow(rows, 43, "context-exit", getSessionModel(session), ok, `hook off: message ${hasOffMessage ? "PRESENT" : "absent"}; hook on: message ${hasOnMessage ? "present" : "ABSENT"}; context ${startPercent}%, levels set ${levels.join(",")}; warnings seen in order: ${seenLevels.join(",")}; toast shown at each crossing: ${toastOnEachCrossing ? "True" : "False"}; no second toast on a later turn at the same level: ${noRepeat ? "True" : "False"}; files read: ${fillerIndex}`);
}

function findPluginPromptRecord(records: JsonRecord[], pluginName: string): JsonRecord | undefined {
  for (const record of records) {
    const isUser = record.type === "user";
    if (!isUser) {
      continue;
    }
    const isFromPlugin = record.origin?.kind === "plugin" && record.origin.name === pluginName;
    if (isFromPlugin) {
      return record;
    }
  }
  return undefined;
}

function readRecordText(record: JsonRecord): string {
  const content = record.message.content;
  if (typeof content === "string") {
    return content;
  }
  let text = "";
  for (const block of content) {
    if (block.type === "text") {
      text += block.text;
    }
  }
  return text;
}

function containsAssistantText(records: JsonRecord[], needle: string): boolean {
  for (const record of records) {
    const content = record.message?.content;
    const isAssistantWithBlocks = record.type === "assistant" && Array.isArray(content);
    if (!isAssistantWithBlocks) {
      continue;
    }
    for (const block of content) {
      const hasNeedle = block.type === "text" && block.text.includes(needle);
      if (hasNeedle) {
        return true;
      }
    }
  }
  return false;
}

// Rows 45 and 46: an open item gets a mod follow-up when on, none when off.
function executeAskDontDumpRows(rows: Row[], session: Session, bed: string): void {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "ask-dont-dump", "turn.complete", true);
  const onBaseline = readRecords(session).length;
  executeTurn(session, ASK_DONT_DUMP_PROMPT);
  tmux_lib.sleep(HOOK_FLUSH_S);
  const followUp = findPluginPromptRecord(readRecords(session).slice(onBaseline), "ask-dont-dump");
  const followUpText = followUp !== undefined ? readRecordText(followUp) : "no message from the ask-dont-dump plugin";
  addRow(rows, 45, "ask-dont-dump", getSessionModel(session), followUp !== undefined, followUpText);

  setEnablement(clone, "ask-dont-dump", "turn.complete", false);
  clearToIdlePrompt(session);
  tmux_lib.sleep(SETTLE_S);
  const offBaseline = readRecords(session).length;
  executeTurn(session, ASK_DONT_DUMP_PROMPT);
  tmux_lib.sleep(CHECKER_WAIT_S);
  const offRecords = readRecords(session).slice(offBaseline);
  const offFollowUp = findPluginPromptRecord(offRecords, "ask-dont-dump");
  const repliedWithOpenItem = containsAssistantText(offRecords, "Task #20 is still open");
  const isSilent = offFollowUp === undefined && repliedWithOpenItem;
  addRow(rows, 46, "ask-dont-dump (off)", getSessionModel(session), isSilent, `reply ended with the open item: ${repliedWithOpenItem ? "True" : "False"}; message from the plugin with the switch off: ${offFollowUp === undefined ? "absent" : "PRESENT"}`);
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

  for (const hookRow of SESSION_ONE_ROWS) {
    const row = executeOffOnPair(rows, session, bed, hookRow, executeFullTurn);
    const isNpmTestRow = hookRow[0] === 5;
    if (isNpmTestRow) {
      const logFiles = listFilesWithSuffix(path.join(bed, "npm-test-logs"), "");
      row.ok = row.ok && logFiles.length > 0;
      row.evidence += ` | log files: ${logFiles.length}`;
    }
  }
  executeAskDontDumpRows(rows, session, bed);
  executeContextExitRow(rows, session, bed);
  return session;
}

// Rows 47 and 48: session hooks cannot switch mid-session, so this session starts with them off.
function addSessionOffRows(rows: Row[], session: Session): void {
  const startMessage = findEvidence(readRecords(session), TASK_LIST_ID_MESSAGE, "SessionStart");
  const hasStartMessage = startMessage !== undefined;
  addRow(rows, 47, "check-task-list-id (off)", getSessionModel(session), !hasStartMessage, `session started with the hook off: message ${hasStartMessage ? "PRESENT" : "absent"}`);
  const screen = tmux_lib.tmux_capturePane(session.name);
  const turnsMatch = TURNS_RE.exec(screen);
  const hasTurnCount = turnsMatch !== null;
  const hasNotWiredText = screen.includes(NOT_WIRED_TEXT);
  const turnCounterOff = !hasTurnCount && hasNotWiredText;
  addRow(rows, 48, "turn-counter (off)", getSessionModel(session), turnCounterOff, `session ran with the hook off: turn count on screen: ${hasTurnCount ? "PRESENT" : "absent"}; not-wired note on screen: ${hasNotWiredText ? "present" : "ABSENT"}`);
}

function executeSecondSession(rows: Row[], bed: string, config: string): Session {
  const project = path.join(bed, "project");
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "check-task-list-id", "SessionStart", false);
  for (const turnCounterEvent of TURN_COUNTER_EVENTS) {
    setEnablement(clone, "turn-counter", turnCounterEvent, false);
  }
  const session = launchSession(SONNET, bed, config);
  executeOffOnPair(rows, session, bed, PONYTAIL_ROW, executeFullTurn);
  validateSessionModel(session, "claude-sonnet-5");
  addSessionOffRows(rows, session);

  for (const hookRow of SESSION_TWO_ROWS) {
    executeOffOnPair(rows, session, bed, hookRow, executeFullTurn);
    removePromptFiles(bed);
  }

  const clarifyRow = executeOffOnPair(rows, session, bed, CLARIFY_ROW, executePromptOnlyTurn);
  const fixItJdiRecords = executePromptOnlyTurn(session, "fix it jdi");
  const gateInOptOut = findEvidence(fixItJdiRecords, "AMBIGUITY GATE", "UserPromptSubmit");
  clarifyRow.ok = clarifyRow.ok && gateInOptOut === undefined;
  clarifyRow.evidence += ` | gate on 'fix it jdi': ${gateInOptOut !== undefined ? "True" : "False"}`;

  writeFileSync(path.join(project, IDLE_PROGRAM_SCRIPT), "sleep 3000\n");
  executeTurn(session, `Use the Bash tool with run_in_background set to true to run exactly this command: bash ./${IDLE_PROGRAM_SCRIPT}`);
  const programFound = spawnSync("pgrep", ["-f", IDLE_PROGRAM_PATTERN]);
  if (programFound.status !== 0) {
    throw new Error(`the background program ${IDLE_PROGRAM_SCRIPT} is not running in session ${session.name}`);
  }

  executeTurn(session, "say hi");
  return session;
}

// Row 44: the idle-state mod searches for the running programs of the state file with escaped regex characters.
function addIdleProgramRow(rows: Row[], second: Session, stateFiles: string[]): void {
  let command = "none";
  let hasProgram = false;
  let isRunning = false;
  let pidCount = 0;
  for (const stateFile of stateFiles) {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    for (const program of state.runningPrograms) {
      const isIdleProgram = program.command.includes(IDLE_PROGRAM_SCRIPT);
      if (isIdleProgram) {
        hasProgram = true;
        command = program.command;
        isRunning = program.isRunning;
        pidCount = program.pids.length;
      }
    }
  }
  const ok = hasProgram && isRunning && pidCount > 0;
  addRow(rows, 44, "idle-state (regex chars)", getSessionModel(second), ok, `state file lists "${command}": listed: ${hasProgram ? "True" : "False"}; found running by pgrep: ${isRunning ? "True" : "False"}; process ids: ${pidCount}`);
}

function executeThirdSession(rows: Row[], bed: string, config: string, second: Session, stateFiles: string[], hasExited: boolean): Session {
  const clone = path.join(bed, "claude_hooks");
  setEnablement(clone, "check-task-list-id", "SessionStart", true);
  for (const turnCounterEvent of TURN_COUNTER_EVENTS) {
    setEnablement(clone, "turn-counter", turnCounterEvent, true);
  }
  const session = launchSession(OPUS, bed, config);
  const turnsBefore = getPaneTurns(session.name);
  const parentRow = executeOffOnPair(rows, session, bed, PARENT_ROW, executeFullTurn);
  const model = validateSessionModel(session, "claude-opus-5");
  const blockedFiles = listFilesWithSuffix(path.join(bed, "blocked-edits"), ".json");
  parentRow.ok = parentRow.ok && blockedFiles.length > 0;
  parentRow.evidence += ` | saved calls: ${blockedFiles.length}`;

  const startMessage = findEvidence(readRecords(session), TASK_LIST_ID_MESSAGE, "SessionStart");
  const hasStartMessage = startMessage !== undefined;
  addRow(rows, 49, "check-task-list-id (on)", model, hasStartMessage, `next session started with the hook on: message ${hasStartMessage ? "present" : "ABSENT"}`);
  tmux_lib.sleep(6);
  const turnsAfter = getPaneTurns(session.name);
  const startedAtZero = turnsBefore === 0;
  const hasTurnsAfter = turnsAfter !== null && turnsAfter >= 1;
  addRow(rows, 50, "turn-counter (on)", model, startedAtZero && hasTurnsAfter, `next session ran with the hook on: turns on screen: before=${turnsBefore} after=${turnsAfter}`);

  const readerFound = findEvidence(readRecords(session), "Tell me about the recent work", "UserPromptSubmit");
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
    const first = executeFirstSession(rows, bed, config);
    tmux_lib.tmux_killPane(first.name);
    const second = executeSecondSession(rows, bed, config);
    const hasExited = tmux_lib.tmux_waitForPaneClose(second.name, IDLE_MS / 1000 + IDLE_MARGIN_S);
    const stateFiles = listFilesWithSuffix(path.join(bed, "project", ".idleState"), ".json");
    addIdleProgramRow(rows, second, stateFiles);
    executeThirdSession(rows, bed, config, second, stateFiles, hasExited);
    for (const result of await executeDirectRows(bed, config)) {
      addRow(rows, result.number, result.hook, null, result.ok, result.evidence);
    }
  }
  finally {
    spawnSync("pkill", ["-f", IDLE_PROGRAM_PATTERN]);
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

export { buildBed, launchSession, readRecords, executeTurn, executePromptOnlyTurn, clearToIdlePrompt, findEvidence }; // TEMP-EXPERIMENT
if (import.meta.main) {
  await executeMain();
}
