#!/usr/bin/env bun
import { after, before, describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync, mkdtempSync, readdirSync, writeFileSync, realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";

const mainCheckout = `${homedir()}/Programming/dotfiles/claude/claude_hooks`;
const scriptPath = `${mainCheckout}/worktreeSetup/newWorktree.sh`;
const programmingDir = `${homedir()}/Programming`;
const gitEnvironmentFlags = ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "protocol.file.allow=always"];

function runGit(repoDir: string, gitArguments: string[]) {
    const gitRun = spawnSync("git", ["-C", repoDir, ...gitEnvironmentFlags, ...gitArguments], { encoding: "utf8" });
    assert.equal(gitRun.status, 0, `${gitRun.stdout}\n${gitRun.stderr}`);
}

function makeRepoWithOneCommittedFile(): string {
    const repoDir = realpathSync(mkdtempSync(`${tmpdir()}/worktree-test-repo-`));
    runGit(repoDir, ["init", "-b", "main"]);
    writeFileSync(`${repoDir}/file.txt`, "hello\n");
    runGit(repoDir, ["add", "file.txt"]);
    runGit(repoDir, ["commit", "-m", "first"]);
    return repoDir;
}

function getLastStdoutLine(stdout: string): string {
    return stdout.trimEnd().split("\n").at(-1) as string;
}

describe("claude_hooks repo", () => {
    const branchName = `worktree-script-test-${process.pid}`;
    const worktreeDir = `${programmingDir}/claude_hooks-worktrees/${branchName}`;
    const submodulePaths = ["tests/external/tmux_lib", "typesafe-template/mod/typesafe-checks"];
    let scriptRun: ReturnType<typeof spawnSync>;

    before(() => {
        scriptRun = spawnSync(scriptPath, [mainCheckout, branchName], { encoding: "utf8" });
    });

    after(() => {
        spawnSync("git", ["-C", mainCheckout, "worktree", "remove", "--force", worktreeDir]);
        spawnSync("git", ["-C", mainCheckout, "branch", "-D", branchName]);
    });

    test("test_newWorktree_exits_zero_and_prints_worktree_path_last", () => {
        // The script ran once in before(): it must exit with code 0.
        assert.equal(scriptRun.status, 0, `${scriptRun.stdout}\n${scriptRun.stderr}`);
        // The last stdout line must be the absolute worktree path, nothing else.
        assert.equal(getLastStdoutLine(scriptRun.stdout as string), worktreeDir);
    });

    test("test_newWorktree_fills_every_submodule", () => {
        // Ask git for the submodule status of the new worktree.
        const submoduleStatus = spawnSync("git", ["-C", worktreeDir, "submodule", "status", "--recursive"], { encoding: "utf8" });
        // No line may start with - (empty), + (wrong commit) or U (merge conflict).
        for (const statusLine of submoduleStatus.stdout.split("\n")) {
            assert.doesNotMatch(statusLine, /^[-+U]/, statusLine);
        }
        // Both submodule folders must contain files.
        for (const submodulePath of submodulePaths) {
            assert.ok(readdirSync(`${worktreeDir}/${submodulePath}`).length > 0, `${submodulePath} is empty`);
        }
    });

    test("test_newWorktree_copies_user_dispatch_settings", () => {
        // The untracked settings file must exist in the new worktree.
        assert.ok(existsSync(`${worktreeDir}/dispatcher/user-dispatch.json`));
    });
});

describe("any repo with one file and one submodule", () => {
    const branchName = `worktree-any-repo-test-${process.pid}`;
    const submoduleSourceRepo = makeRepoWithOneCommittedFile();
    const tempRepo = makeRepoWithOneCommittedFile();
    const worktreesDir = `${programmingDir}/${basename(tempRepo)}-worktrees`;
    const worktreeDir = `${worktreesDir}/${branchName}`;
    let scriptRun: ReturnType<typeof spawnSync>;

    before(() => {
        runGit(tempRepo, ["submodule", "add", submoduleSourceRepo, "sub"]);
        runGit(tempRepo, ["commit", "-m", "add submodule"]);
        scriptRun = spawnSync(scriptPath, [tempRepo, branchName], { encoding: "utf8" });
    });

    after(() => {
        spawnSync("git", ["-C", tempRepo, "worktree", "remove", "--force", worktreeDir]);
        spawnSync("git", ["-C", tempRepo, "branch", "-D", branchName]);
        spawnSync("rm", ["-r", worktreesDir]);
        spawnSync("rm", ["-rf", tempRepo, submoduleSourceRepo]);
    });

    test("test_newWorktree_exits_zero_and_prints_worktree_path_last", () => {
        // The script must exit with code 0.
        assert.equal(scriptRun.status, 0, `${scriptRun.stdout}\n${scriptRun.stderr}`);
        // The last stdout line must be the worktree path in the folder named after the temp repo.
        assert.equal(getLastStdoutLine(scriptRun.stdout as string), worktreeDir);
    });

    test("test_newWorktree_fills_submodule_in_any_repo", () => {
        // The submodule folder in the worktree must contain files.
        assert.ok(readdirSync(`${worktreeDir}/sub`).length > 0, "sub is empty");
    });
});

describe("repo with no .gitmodules and no package.json", () => {
    const branchName = `worktree-plain-repo-test-${process.pid}`;
    const plainRepo = makeRepoWithOneCommittedFile();
    const worktreesDir = `${programmingDir}/${basename(plainRepo)}-worktrees`;
    const worktreeDir = `${worktreesDir}/${branchName}`;
    let scriptRun: ReturnType<typeof spawnSync>;

    before(() => {
        scriptRun = spawnSync(scriptPath, [plainRepo, branchName], { encoding: "utf8" });
    });

    after(() => {
        spawnSync("git", ["-C", plainRepo, "worktree", "remove", "--force", worktreeDir]);
        spawnSync("git", ["-C", plainRepo, "branch", "-D", branchName]);
        spawnSync("rm", ["-r", worktreesDir]);
        spawnSync("rm", ["-rf", plainRepo]);
    });

    test("test_newWorktree_exits_zero_and_prints_worktree_path_last", () => {
        // The script must exit with code 0.
        assert.equal(scriptRun.status, 0, `${scriptRun.stdout}\n${scriptRun.stderr}`);
        // The last stdout line must be the worktree path.
        assert.equal(getLastStdoutLine(scriptRun.stdout as string), worktreeDir);
    });
});
