import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function executeCommand(workDirectory: string, command: string, args: string[]): string {
  const result = spawnSync(command, args, { cwd: workDirectory, encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed in ${workDirectory}: ${result.stderr}`);
  return result.stdout.trim();
}

function buildSafeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._]+/g, "-");
}

function executeSetupCommands(worktreePath: string, setupCommands: string[]): void {
  for (const setupCommand of setupCommands) {
    const result = spawnSync("sh", ["-c", setupCommand], { cwd: worktreePath, encoding: "utf8" });
    if (result.status !== 0)
      throw new Error(`setup command failed in ${worktreePath}: ${setupCommand}: ${result.stderr}`);
  }
}

export function addJobWorktree(workDirectory: string, worktreeDirectory: string, teamName: string, jobName: string, setupCommands: string[]): { worktreePath: string; branch: string; baseBranch: string } {
  const repositoryRoot = executeCommand(workDirectory, "git", ["rev-parse", "--show-toplevel"]);
  const baseBranch = executeCommand(workDirectory, "git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (baseBranch === "HEAD")
    throw new Error(`${workDirectory} has no checked-out branch`);
  const safeTeamName = buildSafeName(teamName);
  const safeJobName = buildSafeName(jobName);
  const branch = `claude-team/${safeTeamName}/${safeJobName}`;
  const worktreePath = `${repositoryRoot}/${worktreeDirectory}/${safeTeamName}-${safeJobName}`;
  // old: always created the worktree and ran the setup commands
  // executeCommand(workDirectory, "git", ["worktree", "add", "-b", branch, worktreePath, baseBranch]);
  // executeSetupCommands(worktreePath, setupCommands);
  const workFolderExists = existsSync(worktreePath);
  if (!workFolderExists) {
    executeCommand(workDirectory, "git", ["worktree", "add", "-b", branch, worktreePath, baseBranch]);
    executeSetupCommands(worktreePath, setupCommands);
  }
  return { worktreePath, branch, baseBranch };
}
