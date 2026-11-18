#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isChatInProject, listPeerChatNames, listTranscriptFolders, parseWorktreePaths } from "./SkillBodyEmitter.ts";

const emitterPath = join(import.meta.dirname, "SkillBodyEmitter.ts");

function runGit(workingFolder: string, gitArguments: string[]): void {
    const result = spawnSync("git", gitArguments, { cwd: workingFolder, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
}

function createFixture(): { homeFolder: string; repoFolder: string; taskFolder: string } {
    const rootFolder = mkdtempSync(join(tmpdir(), "roadmap-emitter-"));
    const homeFolder = join(rootFolder, "home");
    const taskFolder = join(homeFolder, ".claude", "tasks", "fakelist");
    mkdirSync(taskFolder, { recursive: true });
    mkdirSync(join(homeFolder, ".claude", "sessions"));
    mkdirSync(join(homeFolder, ".claude", "projects"));
    for (const [taskNumber, status] of [["10", "pending"], ["2", "in_progress"], ["3", "completed"]])
        writeFileSync(join(taskFolder, `${taskNumber}.json`), JSON.stringify({ id: taskNumber, subject: `task ${taskNumber}`, status }));
    const repoFolder = join(rootFolder, "my.repo");
    mkdirSync(repoFolder);
    runGit(repoFolder, ["init", "-q"]);
    runGit(repoFolder, ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "first"]);
    return { homeFolder, repoFolder: realpathSync(repoFolder), taskFolder };
}

function runEmitter(fixture: { homeFolder: string; repoFolder: string }, taskListId: string | undefined): string {
    const environment: Record<string, string> = { PATH: process.env.PATH as string, HOME: fixture.homeFolder, TMPDIR: tmpdir() };
    if (taskListId !== undefined)
        environment.CLAUDE_CODE_TASK_LIST_ID = taskListId;
    const result = spawnSync("bun", [emitterPath], { cwd: fixture.repoFolder, env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
}

function parseJsonBlock(output: string): Record<string, any> {
    const startMarker = "```json\n";
    const startIndex = output.indexOf(startMarker);
    assert.notEqual(startIndex, -1);
    const endIndex = output.indexOf("\n```", startIndex + startMarker.length);
    return JSON.parse(output.slice(startIndex + startMarker.length, endIndex));
}

test("parseWorktreePaths returns the path of every worktree line", () => {
    // Setup: porcelain text with two worktrees.
    const porcelainText = "worktree /a/main\nHEAD abc\nbranch refs/heads/main\n\nworktree /a/side tree\nHEAD def\ndetached\n";
    // Action and verification: both paths come back, spaces kept.
    assert.deepEqual(parseWorktreePaths(porcelainText), ["/a/main", "/a/side tree"]);
});

test("parseWorktreePaths leaves out the git directory that a submodule reports as its main worktree", () => {
    // Setup: porcelain text from a submodule: the main entry is a path inside .git/modules.
    const porcelainText = "worktree /a/.git/modules/sub\nHEAD abc\nbranch refs/heads/main\n\nworktree /b/linked\nHEAD def\nbranch refs/heads/side\n";
    // Action and verification: only the linked worktree stays.
    assert.deepEqual(parseWorktreePaths(porcelainText), ["/b/linked"]);
});

test("isChatInProject accepts the folder itself and a folder inside it", () => {
    // Action and verification: equal and nested paths match.
    assert.equal(isChatInProject("/a/repo", ["/a/repo"]), true);
    assert.equal(isChatInProject("/a/repo/src/deep", ["/a/repo"]), true);
});

test("isChatInProject rejects a sibling folder that shares a name prefix", () => {
    // Action and verification: /a/repo-other is not inside /a/repo.
    assert.equal(isChatInProject("/a/repo-other", ["/a/repo"]), false);
});

test("listPeerChatNames keeps only named chats inside a project folder", () => {
    // Setup: a sessions folder with one chat inside, one outside, one with no name, and a key file.
    const sessionsFolder = mkdtempSync(join(tmpdir(), "roadmap-sessions-"));
    writeFileSync(join(sessionsFolder, "1.json"), JSON.stringify({ name: "inside chat", cwd: "/a/repo/src", status: "idle" }));
    writeFileSync(join(sessionsFolder, "2.json"), JSON.stringify({ name: "outside chat", cwd: "/b/other", status: "idle" }));
    writeFileSync(join(sessionsFolder, "3.json"), JSON.stringify({ cwd: "/a/repo", status: "idle" }));
    writeFileSync(join(sessionsFolder, "1.abc.key"), "secret");
    // Action and verification: only the inside chat is listed.
    assert.deepEqual(listPeerChatNames(sessionsFolder, ["/a/repo"]), ["inside chat"]);
});

test("listTranscriptFolders keeps folders whose name starts with a project folder name", () => {
    // Setup: a projects folder with the project folder, a nested project folder, and an unrelated one.
    const projectsFolder = mkdtempSync(join(tmpdir(), "roadmap-projects-"));
    for (const folderName of ["-a-my-repo", "-a-my-repo-sub-skills", "-a-other"])
        mkdirSync(join(projectsFolder, folderName));
    // Action and verification: the unrelated folder is left out.
    assert.deepEqual(listTranscriptFolders(projectsFolder, ["/a/my.repo"]).sort(), [join(projectsFolder, "-a-my-repo"), join(projectsFolder, "-a-my-repo-sub-skills")]);
});

test("the JSON block has exactly the documented keys", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: block keys and args keys.
    assert.deepEqual(Object.keys(block).sort(), ["args", "checkCommand", "collectFactsCommand", "openCount", "peerChats", "scriptPath"]);
    assert.deepEqual(Object.keys(block.args).sort(), ["checkCommand", "goal", "peerAnswers", "repoFolders", "researchTaskNumbers", "roadmapFile", "taskFolder", "workFolder", "factsFile"].sort());
});

test("openCount counts the tasks that are not completed", () => {
    // Setup: tasks 10 pending, 2 in_progress, 3 completed.
    const fixture = createFixture();
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: two open tasks.
    assert.equal(block.openCount, 2);
});

test("roadmapFile sits in the plans folder of the repo and is named for the task list", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: the roadmap path and the check command.
    assert.equal(block.args.roadmapFile, join(fixture.repoFolder, "plans", "fakelist-roadmap.json"));
    assert.equal(block.checkCommand, `bun "${join(import.meta.dirname, "checkRoadmap.ts")}" "${block.args.roadmapFile}" "${fixture.taskFolder}"`);
});

test("the facts command holds the arguments with fullRun false and the repo transcript folder", () => {
    // Setup: a normal fixture and one transcript folder for the repo.
    const fixture = createFixture();
    const transcriptFolderName = fixture.repoFolder.replace(/[^a-zA-Z0-9]/g, "-");
    mkdirSync(join(fixture.homeFolder, ".claude", "projects", transcriptFolderName), { recursive: true });
    // Action: run the emitter and cut the JSON out of the command.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    const command: string = block.collectFactsCommand;
    const factsArguments = JSON.parse(command.slice(command.indexOf("'") + 1, command.lastIndexOf("'")));
    // Verification: the command runs the collect script and the arguments are filled.
    assert.equal(command.startsWith(`bun "${join(import.meta.dirname, "collectTaskFacts.ts")}" '`), true);
    assert.equal(factsArguments.fullRun, false);
    assert.deepEqual(factsArguments.transcriptFolders, [join(fixture.homeFolder, ".claude", "projects", transcriptFolderName)]);
    assert.equal(factsArguments.factsFile, block.args.factsFile);
});

test("scriptPath is a copy of the workflow file inside the repo top-level folder", () => {
    // Setup: a normal fixture whose repo folder is a temp folder.
    const fixture = createFixture();
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: the path is under the repo folder, the file exists, and its text equals the source script.
    assert.equal(block.scriptPath, join(fixture.repoFolder, ".claude_hooks", "workflows", "task-roadmap.workflow.js"));
    assert.equal(readFileSync(block.scriptPath, "utf8"), readFileSync(join(import.meta.dirname, "taskRoadmap.workflow.js"), "utf8"));
});

test("a second run overwrites an old copy of the workflow file", () => {
    // Setup: an old copy with other text.
    const fixture = createFixture();
    const copyFolder = join(fixture.repoFolder, ".claude_hooks", "workflows");
    mkdirSync(copyFolder, { recursive: true });
    writeFileSync(join(copyFolder, "task-roadmap.workflow.js"), "old text");
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: the copy holds the source text again.
    assert.equal(readFileSync(block.scriptPath, "utf8"), readFileSync(join(import.meta.dirname, "taskRoadmap.workflow.js"), "utf8"));
});

test("workFolder is a folder named for the task list under the task-roadmap temp folder, and factsFile is inside it", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action: run the emitter.
    const block = parseJsonBlock(runEmitter(fixture, "fakelist"));
    // Verification: both paths, and the same facts file in the command.
    assert.equal(block.args.workFolder, join(tmpdir(), "task-roadmap", "fakelist"));
    assert.equal(block.args.factsFile, join(block.args.workFolder, "facts.json"));
    assert.equal(block.collectFactsCommand.includes(JSON.stringify(block.args.factsFile)), true);
});

test("no JSON is printed without a task list id", () => {
    // Setup: a normal fixture.
    const fixture = createFixture();
    // Action and verification: an unset id prints no block.
    assert.equal(runEmitter(fixture, undefined).includes("```json"), false);
});
