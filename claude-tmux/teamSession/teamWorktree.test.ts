import { after, test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
// import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { addJobWorktree } = await import("./teamWorktree.ts");

// The script writes under ~/Programming. A temporary HOME keeps that out of the real home folder.
const originalHome = process.env.HOME;
const temporaryHome = realpathSync(mkdtempSync(join(tmpdir(), "team-worktree-home-")));
process.env.HOME = temporaryHome;
after(() => {
  process.env.HOME = originalHome;
  rmSync(temporaryHome, { recursive: true, force: true });
});

function runGit(repository: string, args: string[]): string {
  const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], { cwd: repository, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function makeRepositoryOnBranchWork(): string {
  const repository = mkdtempSync(join(tmpdir(), "team-worktree-"));
  runGit(repository, ["init", "-q", "-b", "main"]);
  writeFileSync(join(repository, "first.txt"), "first");
  runGit(repository, ["add", "first.txt"]);
  runGit(repository, ["commit", "-q", "-m", "first"]);
  runGit(repository, ["checkout", "-q", "-b", "work"]);
  writeFileSync(join(repository, "only-on-work.txt"), "work");
  runGit(repository, ["add", "only-on-work.txt"]);
  runGit(repository, ["commit", "-q", "-m", "second"]);
  return repository;
}

test("test_addJobWorktree_makes_the_worktree_from_the_checked_out_branch", () => {
  // Scenario: the repository has the branch main and the checked-out branch work. Only work holds only-on-work.txt.
  // Step 1: make the repository and add the worktree for team "plan check" and job "jobA".
  const repository = makeRepositoryOnBranchWork();
  const result = addJobWorktree(repository, "plan check", "jobA");
  // Step 2: check that the worktree holds the file of the checked-out branch, that the base branch is work and that the new branch has the safe name.
  assert.equal(existsSync(join(result.worktreePath, "only-on-work.txt")), true);
  assert.equal(result.baseBranch, "work");
  assert.equal(result.branch, "claude-tmux-team/plan-check/jobA");
  assert.equal(runGit(result.worktreePath, ["rev-parse", "--abbrev-ref", "HEAD"]), "claude-tmux-team/plan-check/jobA");
});

test("test_addJobWorktree_copies_user_dispatch_file_into_the_worktree", () => {
  // Scenario: the repository has an untracked dispatcher/user-dispatch.json.
  // Step 1: make the repository with a committed dispatcher folder and write the untracked file.
  const repository = makeRepositoryOnBranchWork();
  mkdirSync(join(repository, "dispatcher"));
  writeFileSync(join(repository, "dispatcher", "dispatch.json"), "{}");
  runGit(repository, ["add", "dispatcher/dispatch.json"]);
  runGit(repository, ["commit", "-q", "-m", "dispatcher"]);
  writeFileSync(join(repository, "dispatcher", "user-dispatch.json"), "{}");
  // Step 2: add the worktree. Check that the worktree holds the file.
  const result = addJobWorktree(repository, "plan check", "jobA");
  assert.equal(existsSync(join(result.worktreePath, "dispatcher", "user-dispatch.json")), true);
});

// Obsolete: the script decides the worktree folder.
// test("test_addJobWorktree_puts_the_worktree_in_the_worktree_directory_of_the_repository_root", () => {
//   // Scenario: the worktree path is root, worktree directory, safe team name, safe job name.
//   // Step: add the worktree. Check that the path ends with the expected text.
//   const repository = makeRepositoryOnBranchWork();
//   const result = addJobWorktree(repository, ".claude/worktrees", "plan check", "jobA", []);
//   assert.equal(result.worktreePath.endsWith("/.claude/worktrees/plan-check-jobA"), true);
// });

// Obsolete: the script runs the setup, not setup commands.
// test("test_addJobWorktree_runs_each_setup_command_in_the_worktree", () => {
//   // Scenario: a setup command writes a file in its folder.
//   // Step: add the worktree with that command. Check that the file is in the worktree.
//   const repository = makeRepositoryOnBranchWork();
//   const result = addJobWorktree(repository, ".claude/worktrees", "plan check", "jobA", ["touch setup-ran.txt"]);
//   assert.equal(existsSync(join(result.worktreePath, "setup-ran.txt")), true);
// });

// Obsolete: the script runs the setup, not setup commands.
// test("test_addJobWorktree_throws_when_a_setup_command_fails", () => {
//   // Scenario: the setup command exits with 3.
//   // Step: add the worktree. Check that it throws.
//   const repository = makeRepositoryOnBranchWork();
//   assert.throws(() => addJobWorktree(repository, ".claude/worktrees", "plan check", "jobA", ["exit 3"]), /setup command failed/);
// });

test("test_addJobWorktree_throws_on_a_detached_head", () => {
  // Scenario: the repository has no checked-out branch.
  // Step: detach HEAD. Add the worktree. Check that it throws.
  const repository = makeRepositoryOnBranchWork();
  runGit(repository, ["checkout", "-q", "--detach"]);
  assert.throws(() => addJobWorktree(repository, "plan check", "jobA"), /no checked-out branch/);
});

test("test_addJobWorktree_uses_the_existing_work_folder_of_the_job", () => {
  // Scenario: the work folder of the job exists already, for example after a restart of the computer.
  // Step 1: add the worktree and write a new file into it.
  const repository = makeRepositoryOnBranchWork();
  const firstResult = addJobWorktree(repository, "plan check", "jobA");
  writeFileSync(join(firstResult.worktreePath, "written-later.txt"), "later");
  // Step 2: add the worktree a second time with the same arguments. Check that it does not throw, returns the same path and branch, and keeps the file.
  const secondResult = addJobWorktree(repository, "plan check", "jobA");
  assert.equal(secondResult.worktreePath, firstResult.worktreePath);
  assert.equal(secondResult.branch, firstResult.branch);
  assert.equal(existsSync(join(secondResult.worktreePath, "written-later.txt")), true);
});

// Obsolete: the script runs the setup, not setup commands.
// test("test_addJobWorktree_skips_the_setup_commands_for_an_existing_work_folder", () => {
//   // Scenario: the setup command appends one line to a file.
//   // Step 1: add the worktree with that command, then add it a second time with the same arguments.
//   const repository = makeRepositoryOnBranchWork();
//   const setupCommands = ["echo ran >> setup-ran.txt"];
//   const firstResult = addJobWorktree(repository, ".claude/worktrees", "plan check", "jobA", setupCommands);
//   addJobWorktree(repository, ".claude/worktrees", "plan check", "jobA", setupCommands);
//   // Step 2: check that the file holds exactly one line.
//   assert.equal(readFileSync(join(firstResult.worktreePath, "setup-ran.txt"), "utf8"), "ran\n");
// });
