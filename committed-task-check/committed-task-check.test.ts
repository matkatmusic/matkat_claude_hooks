import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

const TASK_LIST_ID = "committed-task-check-test";
const OPEN_TASK_NUMBER = 7;

type Fixture = {
    repo: string;
    home: string;
    stateDir: string;
    transcriptPath: string;
    sessionId: string;
};

function runGit(folder: string, args: string[]): string {
    const identity = ["-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "-c", "protocol.file.allow=always"];
    return execFileSync("git", ["-C", folder, ...identity, ...args], { encoding: "utf8" }).trim();
}

function makeCommit(folder: string, fileName: string): string {
    writeFileSync(`${folder}/${fileName}`, fileName);
    runGit(folder, ["add", fileName]);
    runGit(folder, ["commit", "-q", "-m", `title of ${fileName}`]);
    return runGit(folder, ["rev-parse", "--short", "HEAD"]);
}

function writeTask(home: string, taskNumber: number, status: string): void {
    const taskFolder = `${home}/.claude/tasks/${TASK_LIST_ID}`;
    mkdirSync(taskFolder, { recursive: true });
    const task = { id: String(taskNumber), subject: `subject ${taskNumber}`, description: "", status, blocks: [], blockedBy: [] };
    writeFileSync(`${taskFolder}/${taskNumber}.json`, JSON.stringify(task));
}

function setUpFixture(taskStatus: string): Fixture {
    const root = mkdtempSync(`${tmpdir()}/committed-task-check-`);
    const repo = `${root}/repo`;
    const home = `${root}/home`;
    const stateDir = `${root}/state`;
    mkdirSync(repo);
    runGit(repo, ["init", "-q", "-b", "main"]);
    makeCommit(repo, "first.txt");
    writeTask(home, OPEN_TASK_NUMBER, taskStatus);
    const transcriptPath = `${root}/session-one.jsonl`;
    return { repo, home, stateDir, transcriptPath, sessionId: "session-one" };
}

function writeTranscript(fixture: Fixture): void {
    writeFileSync(fixture.transcriptPath, "");
}

function sleepPastNextSecond(): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
}

function runHook(fixture: Fixture, overrides: object = {}, taskListId: string | null = TASK_LIST_ID): string {
    const payload = {
        cwd: fixture.repo,
        session_id: fixture.sessionId,
        transcript_path: fixture.transcriptPath,
        stop_hook_active: false,
        settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: fixture.stateDir },
        ...overrides,
    };
    const environment: Record<string, string | undefined> = { ...process.env, HOME: fixture.home, CLAUDE_CODE_TASK_LIST_ID: taskListId ?? undefined };
    const result = spawnSync("node", [`${import.meta.dirname}/committed-task-check.ts`], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function assertBlocksWithCommitAndTask(output: string, commitHash: string): void {
    const decision = JSON.parse(output);
    assert.equal(decision.decision, "block");
    assert.ok(decision.reason.includes(commitHash));
    assert.ok(decision.reason.includes(`#${OPEN_TASK_NUMBER}`));
}

test("test_new_commit_with_open_task_blocks", () => {
    // Scenario: a commit exists after the chat began and a task is pending.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt");
    // The stop is blocked, and the reason names the commit and the task number.
    assertBlocksWithCommitAndTask(runHook(fixture), commitHash);
});

test("test_in_progress_task_also_counts_as_open", () => {
    // Scenario: the only open task is in progress, not pending.
    const fixture = setUpFixture("in_progress");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt");
    // The stop is blocked, and the reason names the in-progress task.
    assertBlocksWithCommitAndTask(runHook(fixture), commitHash);
});

test("test_next_stop_without_newer_commit_passes", () => {
    // Scenario: the first stop blocks and moves the marker.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt");
    assertBlocksWithCommitAndTask(runHook(fixture), commitHash);
    // The second stop has no newer commit, so it prints nothing.
    assert.equal(runHook(fixture), "");
});

test("test_stop_hook_active_passes_and_keeps_marker", () => {
    // Scenario: a commit exists and the stop is a forced continuation.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt");
    // The active stop prints nothing.
    assert.equal(runHook(fixture, { stop_hook_active: true }), "");
    // The marker did not move, so the next normal stop still blocks.
    assertBlocksWithCommitAndTask(runHook(fixture), commitHash);
});

test("test_no_open_tasks_passes", () => {
    // Scenario: a commit exists but the only task is completed.
    const fixture = setUpFixture("completed");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt");
    // The stop prints nothing.
    assert.equal(runHook(fixture), "");
});

test("test_first_turn_commit_is_caught_without_marker", () => {
    // Scenario: an old commit exists before the transcript file is created.
    const fixture = setUpFixture("pending");
    const oldCommitHash = runGit(fixture.repo, ["rev-parse", "--short", "HEAD"]);
    sleepPastNextSecond();
    // The transcript is created, then a new commit is made. No marker exists yet.
    writeTranscript(fixture);
    const newCommitHash = makeCommit(fixture.repo, "second.txt");
    // The stop blocks and names the new commit but not the old one.
    const decision = JSON.parse(runHook(fixture));
    assert.equal(decision.decision, "block");
    assert.ok(decision.reason.includes(newCommitHash));
    assert.ok(!decision.reason.includes(oldCommitHash));
});

test("test_submodule_commit_is_caught", () => {
    // Scenario: the repo holds a submodule, and the transcript is created after the submodule is added.
    const fixture = setUpFixture("pending");
    const submoduleSource = `${fixture.repo}-submodule-source`;
    mkdirSync(submoduleSource);
    runGit(submoduleSource, ["init", "-q", "-b", "main"]);
    makeCommit(submoduleSource, "inner.txt");
    runGit(fixture.repo, ["submodule", "add", "-q", submoduleSource, "libs/inner"]);
    runGit(fixture.repo, ["commit", "-q", "-m", "add submodule"]);
    writeTranscript(fixture);
    // A commit is made inside the submodule only.
    const commitHash = makeCommit(`${fixture.repo}/libs/inner`, "inner-two.txt");
    // The stop blocks and names the submodule commit.
    assertBlocksWithCommitAndTask(runHook(fixture), commitHash);
});

test("test_missing_task_list_id_passes", () => {
    // Scenario: a commit and an open task exist, but CLAUDE_CODE_TASK_LIST_ID is not set.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt");
    // The stop prints nothing.
    assert.equal(runHook(fixture, {}, null), "");
});

test("test_reason_holds_script_path_and_roadmap_path_when_roadmap_exists", () => {
    // Scenario: a commit and an open task exist, and the repo has a roadmap file for the task list.
    const fixture = setUpFixture("pending");
    const topLevelFolder = runGit(fixture.repo, ["rev-parse", "--show-toplevel"]);
    const roadmapFile = `${topLevelFolder}/plans/${TASK_LIST_ID}-roadmap.json`;
    mkdirSync(`${topLevelFolder}/plans`);
    writeFileSync(roadmapFile, "[]\n");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt");
    // The stop blocks.
    const decision = JSON.parse(runHook(fixture));
    assert.equal(decision.decision, "block");
    // The reason holds the real script path and the real roadmap path.
    assert.ok(decision.reason.includes(`${import.meta.dirname}/markRoadmapTaskCompleted.ts`));
    assert.ok(decision.reason.includes(roadmapFile));
});

test("test_reason_holds_no_script_path_when_roadmap_is_missing", () => {
    // Scenario: a commit and an open task exist, and the repo has no roadmap file.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt");
    // The stop blocks.
    const decision = JSON.parse(runHook(fixture));
    assert.equal(decision.decision, "block");
    // The reason holds no roadmap script path.
    assert.ok(!decision.reason.includes("markRoadmapTaskCompleted"));
});
