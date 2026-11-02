import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { type JsonRecord, REPO } from "./stranger_constants.ts";
import { writeUserDispatch } from "./stranger_dispatch.ts";
import { executeCommand } from "./stranger_helpers.ts";

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
  settings.statusLine = { type: "command", command: `node "${clone}/status-line/status.ts"`, refreshInterval: 1 };
  settings.subagentStatusLine = { type: "command", command: `node "${clone}/status-line/subagentStatusLine.ts"`, refreshInterval: 1 };
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

export function buildBed(bed: string, config: string): void {
  const clone = path.join(bed, "claude_hooks");
  mkdirSync(bed, { recursive: true });
  executeCommand(["git", "clone", "-q", REPO, clone]);
  copyUncommittedChanges(clone);
  copyUntrackedFiles(REPO, clone);
  executeCommand(["npm", "install"], clone);
  writeFileSync(path.join(bed, "planning.md"), "A plan has a goal, steps, and a test for each step.\n");
  writeUserDispatch(clone, bed, config);
  createProject(path.join(bed, "project"));
  writeSettings(config, clone);
  installPlugins(clone, config);
}
