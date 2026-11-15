#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const emitterPath = join(import.meta.dirname, "SkillBodyEmitter.ts");

function runGit(workingFolder: string, gitArguments: string[]): void {
    const result = spawnSync("git", ["-c", "protocol.file.allow=always", ...gitArguments], { cwd: workingFolder, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
}

function createGitRepo(parentFolder: string, name: string): string {
    const repoFolder = join(parentFolder, name);
    mkdirSync(repoFolder);
    runGit(repoFolder, ["init", "-q"]);
    runGit(repoFolder, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first"]);
    return realpathSync(repoFolder);
}

function writeTask(taskFolder: string, taskId: string, status: string): void {
    writeFileSync(join(taskFolder, `${taskId}.json`), JSON.stringify({ id: taskId, subject: `task ${taskId}`, status }));
}

function createHomeWithTasks(rootFolder: string): string {
    const homeFolder = join(rootFolder, "home");
    const taskFolder = join(homeFolder, ".claude", "tasks", "fakelist");
    mkdirSync(taskFolder, { recursive: true });
    writeTask(taskFolder, "10", "pending");
    writeTask(taskFolder, "2", "pending");
    writeTask(taskFolder, "3", "completed");
    writeTask(taskFolder, "4", "in_progress");
    return homeFolder;
}

function runEmitter(homeFolder: string, workingFolder: string, taskListId: string | undefined): string {
    const environment: Record<string, string> = { PATH: process.env.PATH as string, HOME: homeFolder };
    if (taskListId !== undefined)
        environment.CLAUDE_CODE_TASK_LIST_ID = taskListId;
    const result = spawnSync("bun", [emitterPath], { cwd: workingFolder, env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function parseArgumentsBlock(output: string): Record<string, unknown> {
    const startMarker = "```json\n";
    const startIndex = output.indexOf(startMarker);
    assert.notEqual(startIndex, -1);
    const endIndex = output.indexOf("\n```", startIndex + startMarker.length);
    return JSON.parse(output.slice(startIndex + startMarker.length, endIndex));
}

function createFixture(): { rootFolder: string; homeFolder: string; repoFolder: string } {
    const rootFolder = mkdtempSync(join(tmpdir(), "prune-emitter-"));
    const homeFolder = createHomeWithTasks(rootFolder);
    const repoFolder = createGitRepo(rootFolder, "my.repo");
    return { rootFolder, homeFolder, repoFolder };
}

test("pending ids are listed in number order and other statuses are left out", () => {
    // Setup: a task folder with pending 10 and 2, completed 3, in_progress 4.
    const fixture = createFixture();
    // Action: run the emitter.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, "fakelist");
    // Verification: only pending ids, sorted by number, and the count matches.
    const parsed = parseArgumentsBlock(output);
    assert.deepEqual((parsed.args as Record<string, unknown>).taskIds, ["2", "10"]);
    assert.equal(parsed.pendingCount, 2);
});

test("repoFolders holds the repo top-level folder and a submodule folder", () => {
    // Setup: a repo that has one submodule.
    const fixture = createFixture();
    const submoduleSourceFolder = createGitRepo(fixture.rootFolder, "sub-source");
    runGit(fixture.repoFolder, ["submodule", "add", "-q", submoduleSourceFolder, "vendor/sub"]);
    // Action: run the emitter from a folder inside the repo.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, "fakelist");
    // Verification: the top-level folder comes first, then the submodule as an absolute path.
    const parsed = parseArgumentsBlock(output);
    assert.deepEqual((parsed.args as Record<string, unknown>).repoFolders, [fixture.repoFolder, join(fixture.repoFolder, "vendor/sub")]);
});

test("transcriptFolder and memoryFile are derived from the repo path", () => {
    // Setup: a repo whose path has dots and slashes.
    const fixture = createFixture();
    // Action: run the emitter.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, "fakelist");
    // Verification: every character that is not a letter or digit became a dash.
    const parsed = parseArgumentsBlock(output);
    const folderName = fixture.repoFolder.replace(/[^a-zA-Z0-9]/g, "-");
    const expectedTranscriptFolder = join(fixture.homeFolder, ".claude", "projects", folderName);
    assert.equal((parsed.args as Record<string, unknown>).transcriptFolder, expectedTranscriptFolder);
    assert.equal((parsed.args as Record<string, unknown>).memoryFile, join(expectedTranscriptFolder, "memory", "MEMORY.md"));
});

test("scriptPath points at an existing file", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, "fakelist");
    // Verification: the printed script path exists.
    const parsed = parseArgumentsBlock(output);
    assert.equal(existsSync(parsed.scriptPath as string), true);
});

test("taskFolder and closedBy hold the task list folder and today's date", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, "fakelist");
    // Verification: the task folder comes from the task list id and closedBy ends in a date.
    const parsed = parseArgumentsBlock(output);
    assert.equal((parsed.args as Record<string, unknown>).taskFolder, join(fixture.homeFolder, ".claude", "tasks", "fakelist"));
    assert.match((parsed.args as Record<string, unknown>).closedBy as string, /^task-list pruning \d{4}-\d{2}-\d{2}$/);
});

test("no JSON is printed when CLAUDE_CODE_TASK_LIST_ID is unset", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter with no task list id.
    const output = runEmitter(fixture.homeFolder, fixture.repoFolder, undefined);
    // Verification: the output holds no JSON block.
    assert.equal(output.includes("```json"), false);
    assert.equal(output.includes("{"), false);
});
