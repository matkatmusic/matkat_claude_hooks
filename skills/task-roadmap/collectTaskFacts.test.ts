#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectTaskFacts, type RoadmapEntry } from "./collectTaskFacts.ts";

interface Fixture {
    taskFolder: string;
    transcriptFolder: string;
    roadmapFile: string;
    factsFile: string;
}

function createFixture(): Fixture {
    const rootFolder = mkdtempSync(join(tmpdir(), "collect-facts-"));
    const taskFolder = join(rootFolder, "tasks");
    const transcriptFolder = join(rootFolder, "logs");
    mkdirSync(taskFolder);
    mkdirSync(transcriptFolder);
    return { taskFolder, transcriptFolder, roadmapFile: join(rootFolder, "roadmap.json"), factsFile: join(rootFolder, "work", "facts.json") };
}

function writeTaskFile(fixture: Fixture, taskNumber: number, status: string): void {
    const task = { id: String(taskNumber), subject: `subject ${taskNumber}`, description: `description ${taskNumber}`, status, blockedBy: [], blocks: [] };
    writeFileSync(join(fixture.taskFolder, `${taskNumber}.json`), JSON.stringify(task));
}

function buildCreateLines(taskNumber: number, time: string): string[] {
    const toolUseId = `toolu_${taskNumber}`;
    const toolUseBlock = { type: "tool_use", id: toolUseId, name: "TaskCreate", input: { subject: `subject ${taskNumber}` } };
    const toolResultBlock = { type: "tool_result", tool_use_id: toolUseId, content: `Task #${taskNumber} created successfully: subject ${taskNumber}` };
    return [
        JSON.stringify({ type: "assistant", timestamp: time, message: { content: [toolUseBlock] } }),
        JSON.stringify({ type: "user", timestamp: time, message: { content: [toolResultBlock] } }),
    ];
}

function buildRequestBlobLine(taskNumber: number): string {
    const toolUseBlock = { type: "tool_use", id: "toolu_blob", name: "TaskUpdate", input: { taskId: String(taskNumber), status: "completed" } };
    return JSON.stringify({ type: "api-request-blob", hash: "abc", sessionId: "aaaaaaaa-1111", message: { content: [toolUseBlock] } });
}

function buildUpdateLine(taskNumber: number, status: string, time: string): string {
    const toolUseBlock = { type: "tool_use", id: `toolu_update_${status}`, name: "TaskUpdate", input: { taskId: String(taskNumber), status } };
    return JSON.stringify({ type: "assistant", timestamp: time, message: { content: [toolUseBlock] } });
}

function buildTitleLine(sessionId: string, customTitle: string): string {
    return JSON.stringify({ type: "custom-title", customTitle, sessionId });
}

function writeLog(fixture: Fixture, sessionId: string, lines: string[]): void {
    writeFileSync(join(fixture.transcriptFolder, `${sessionId}.jsonl`), lines.join("\n") + "\n");
}

function buildOldEntry(taskNumber: number, overrides: Partial<RoadmapEntry>): RoadmapEntry {
    return { taskNumber, started: "", session: [], status: "", branch: "", lastUpdated: "2026-11-12T00:00:00Z", blockedBy: "", completed: "", ...overrides };
}

function writeOldRoadmap(fixture: Fixture, entries: RoadmapEntry[]): void {
    writeFileSync(fixture.roadmapFile, JSON.stringify(entries));
}

async function runCollect(fixture: Fixture, fullRun = false, repoFolders: string[] = []): Promise<any> {
    await collectTaskFacts({
        taskFolder: fixture.taskFolder,
        transcriptFolders: [fixture.transcriptFolder],
        repoFolders,
        roadmapFile: fixture.roadmapFile,
        factsFile: fixture.factsFile,
        fullRun,
    });
    return JSON.parse(readFileSync(fixture.factsFile, "utf8"));
}

function runGit(repoFolder: string, gitArguments: string[]): void {
    const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...gitArguments], { cwd: repoFolder, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
}

function createRepoWithCommit(parentFolder: string, branch: string, message: string): string {
    const repoFolder = join(parentFolder, "repo");
    mkdirSync(repoFolder);
    runGit(repoFolder, ["-c", `init.defaultBranch=${branch}`, "init", "-q"]);
    runGit(repoFolder, ["commit", "-q", "--allow-empty", "-m", message]);
    return repoFolder;
}

test("the create time is found from the TaskCreate line joined to its result", async () => {
    // Setup: open task 7 created in one chat.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeLog(fixture, "aaaaaaaa-1111", buildCreateLines(7, "2026-11-10T10:00:00.123Z"));
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: created is in the roadmap date format without a fraction.
    assert.equal(facts.openTasks[0].created, "2026-11-10T10:00:00Z");
});

test("the in-progress time is found from the first TaskUpdate with that status", async () => {
    // Setup: task 7 created, then set in_progress twice.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "in_progress");
    const lines = [...buildCreateLines(7, "2026-11-10T10:00:00.000Z"), buildUpdateLine(7, "in_progress", "2026-11-10T11:00:00.000Z"), buildUpdateLine(7, "in_progress", "2026-11-10T12:00:00.000Z")];
    writeLog(fixture, "aaaaaaaa-1111", lines);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: the first in_progress time wins and the last event is the newest line.
    assert.equal(facts.openTasks[0].markedInProgress, "2026-11-10T11:00:00Z");
    assert.equal(facts.openTasks[0].lastEvent, "2026-11-10T12:00:00Z");
});

test("a chat that only created the task has workedOnTask false", async () => {
    // Setup: task 7 created in a titled chat and never updated.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeLog(fixture, "aaaaaaaa-1111", [buildTitleLine("aaaaaaaa-1111", "creator chat"), ...buildCreateLines(7, "2026-11-10T10:00:00.000Z")]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: the session list holds the chat title with workedOnTask false.
    assert.deepEqual(facts.openTasks[0].sessions, [{ name: "creator chat", workedOnTask: false }]);
});

test("a chat that sent a TaskUpdate has workedOnTask true and an untitled chat uses 8 characters of its id", async () => {
    // Setup: task 7 created in one chat, updated in a second chat with no title.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "in_progress");
    writeLog(fixture, "aaaaaaaa-1111", [buildTitleLine("aaaaaaaa-1111", "creator chat"), ...buildCreateLines(7, "2026-11-10T10:00:00.000Z")]);
    writeLog(fixture, "bbbbbbbb-2222", [buildUpdateLine(7, "in_progress", "2026-11-10T11:00:00.000Z")]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: creator false, updater true with the short id as name.
    assert.deepEqual(facts.openTasks[0].sessions, [{ name: "creator chat", workedOnTask: false }, { name: "bbbbbbbb", workedOnTask: true }]);
});

test("a create line whose subject differs from the task file is ignored", async () => {
    // Setup: the result says Task #7 but the subject belongs to another task.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    const lines = buildCreateLines(7, "2026-11-10T10:00:00.000Z");
    writeLog(fixture, "aaaaaaaa-1111", [lines[0].replace("subject 7", "other subject"), lines[1]]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: no create time.
    assert.equal(facts.openTasks[0].created, "");
});

test("an api-request-blob line that repeats a TaskUpdate is ignored", async () => {
    // Setup: task 7 is open and the log holds only a request blob line with no timestamp.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeLog(fixture, "aaaaaaaa-1111", [buildRequestBlobLine(7)]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: the task has no event and no session.
    assert.equal(facts.openTasks[0].lastEvent, "");
    assert.deepEqual(facts.openTasks[0].sessions, []);
});

test("needsResearch is true for every task on a full run", async () => {
    // Setup: task 7 has a current old entry.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeOldRoadmap(fixture, [buildOldEntry(7, {})]);
    // Action: collect the facts with fullRun true.
    const facts = await runCollect(fixture, true);
    // Verification: research is needed.
    assert.equal(facts.openTasks[0].needsResearch, true);
});

test("needsResearch is true for a task with no old entry", async () => {
    // Setup: task 7 is open and the roadmap file does not exist.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: research is needed and oldEntry is null.
    assert.equal(facts.openTasks[0].needsResearch, true);
    assert.equal(facts.openTasks[0].oldEntry, null);
});

test("needsResearch is true when the last event is newer than the old lastUpdated", async () => {
    // Setup: an update on 2026-11-14 and an old entry last updated on 2026-11-12.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "in_progress");
    writeLog(fixture, "aaaaaaaa-1111", [buildUpdateLine(7, "in_progress", "2026-11-14T00:00:00.000Z")]);
    writeOldRoadmap(fixture, [buildOldEntry(7, {})]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: research is needed.
    assert.equal(facts.openTasks[0].needsResearch, true);
});

test("needsResearch is true when the old integer blockedBy is no longer an open task", async () => {
    // Setup: task 7 was blocked by task 5, and task 5 is now completed.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeTaskFile(fixture, 5, "completed");
    writeOldRoadmap(fixture, [buildOldEntry(7, { blockedBy: 5 })]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: research is needed for task 7.
    assert.equal(facts.openTasks[0].needsResearch, true);
});

test("needsResearch is false when no cause applies", async () => {
    // Setup: old entry is current, no newer event, blocker still open, no repo.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeTaskFile(fixture, 5, "pending");
    writeLog(fixture, "aaaaaaaa-1111", [buildUpdateLine(7, "pending", "2026-11-11T00:00:00.000Z")]);
    writeOldRoadmap(fixture, [buildOldEntry(5, {}), buildOldEntry(7, { blockedBy: 5 })]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: neither task needs research and the old entry is carried along.
    assert.equal(facts.openTasks[1].needsResearch, false);
    assert.equal(facts.openTasks[1].oldEntry.blockedBy, 5);
});

test("needsResearch is true when a commit message names the task number after the last update", async () => {
    // Setup: a repo whose newest commit says #7.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeOldRoadmap(fixture, [buildOldEntry(7, { lastUpdated: "2000-01-01T00:00:00Z" })]);
    const repoFolder = createRepoWithCommit(join(fixture.taskFolder, ".."), "main", "work for #7 done");
    // Action: collect the facts with that repo.
    const facts = await runCollect(fixture, false, [repoFolder]);
    // Verification: research is needed.
    assert.equal(facts.openTasks[0].needsResearch, true);
});

test("a commit that names #70 does not count for task 7", async () => {
    // Setup: a repo whose newest commit says #70.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeOldRoadmap(fixture, [buildOldEntry(7, { lastUpdated: "2000-01-01T00:00:00Z" })]);
    const repoFolder = createRepoWithCommit(join(fixture.taskFolder, ".."), "main", "work for #70 done");
    // Action: collect the facts with that repo.
    const facts = await runCollect(fixture, false, [repoFolder]);
    // Verification: no research is needed.
    assert.equal(facts.openTasks[0].needsResearch, false);
});

test("needsResearch is true when the old branch has a commit newer than lastUpdated", async () => {
    // Setup: an old entry on branch work, and a repo whose branch work has a fresh commit.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "pending");
    writeOldRoadmap(fixture, [buildOldEntry(7, { branch: "work", lastUpdated: "2000-01-01T00:00:00Z" })]);
    const repoFolder = createRepoWithCommit(join(fixture.taskFolder, ".."), "work", "plain message");
    // Action: collect the facts with that repo.
    const facts = await runCollect(fixture, false, [repoFolder]);
    // Verification: research is needed.
    assert.equal(facts.openTasks[0].needsResearch, true);
});

test("closedSinceLastRun holds the completion time from the logs for a task that is now completed", async () => {
    // Setup: old entry open, task file completed, a completed TaskUpdate in the logs.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "completed");
    writeLog(fixture, "aaaaaaaa-1111", [buildUpdateLine(7, "completed", "2026-11-13T09:30:00.000Z")]);
    writeOldRoadmap(fixture, [buildOldEntry(7, {})]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: one closed task with the log time, and it is not an open task.
    assert.deepEqual(facts.closedSinceLastRun, [{ taskNumber: 7, completedAt: "2026-11-13T09:30:00Z" }]);
    assert.equal(facts.openTasks.length, 0);
});

test("closedSinceLastRun uses the current time for a missing task file with no log line", async () => {
    // Setup: old entry open, no task file, no logs.
    const fixture = createFixture();
    writeOldRoadmap(fixture, [buildOldEntry(7, {})]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: one closed task with a time in the roadmap date format.
    assert.equal(facts.closedSinceLastRun.length, 1);
    assert.match(facts.closedSinceLastRun[0].completedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test("an old entry that is already completed is not listed again", async () => {
    // Setup: old entry has a completed time and the task file is completed.
    const fixture = createFixture();
    writeTaskFile(fixture, 7, "completed");
    writeOldRoadmap(fixture, [buildOldEntry(7, { completed: "2026-11-13T09:30:00Z" })]);
    // Action: collect the facts.
    const facts = await runCollect(fixture);
    // Verification: nothing closed since last run.
    assert.deepEqual(facts.closedSinceLastRun, []);
});
