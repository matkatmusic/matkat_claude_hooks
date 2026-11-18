import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";

const TASK_LIST_ID = "committed-task-check-test";
const OPEN_TASK_NUMBER = 7;
const OTHER_OPEN_TASK_NUMBER = 8;
const teamValues = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const TEAM_LEADER_JOB = teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"];
const DIRECTOR_JOB = teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
const HELPER_JOB = teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"].split(",")[0];

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

function makeCommit(folder: string, fileName: string, message: string = `title of ${fileName}`): string {
    writeFileSync(`${folder}/${fileName}`, fileName);
    runGit(folder, ["add", fileName]);
    runGit(folder, ["commit", "-q", "-m", message]);
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

function runHook(fixture: Fixture, overrides: object = {}, taskListId: string | null = TASK_LIST_ID, teamJob: string | undefined = undefined): string {
    const payload = {
        cwd: fixture.repo,
        session_id: fixture.sessionId,
        transcript_path: fixture.transcriptPath,
        stop_hook_active: false,
        settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: fixture.stateDir },
        ...overrides,
    };
    const environment: Record<string, string | undefined> = { ...process.env, HOME: fixture.home, CLAUDE_CODE_TASK_LIST_ID: taskListId ?? undefined, CLAUDE_TMUX_TEAM_JOB: teamJob };
    const result = spawnSync("node", [`${import.meta.dirname}/committedTaskCheck.ts`], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: environment,
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
}

function runHookAndGetExitStatus(fixture: Fixture, teamJob: string | undefined): number | null {
    const payload = {
        cwd: fixture.repo,
        session_id: fixture.sessionId,
        transcript_path: fixture.transcriptPath,
        stop_hook_active: false,
        settings: { CLAUDE_HOOKS_SESSION_STATE_DIR: fixture.stateDir },
    };
    const environment: Record<string, string | undefined> = { ...process.env, HOME: fixture.home, CLAUDE_CODE_TASK_LIST_ID: TASK_LIST_ID, CLAUDE_TMUX_TEAM_JOB: teamJob };
    const result = spawnSync("node", [`${import.meta.dirname}/committedTaskCheck.ts`], {
        input: JSON.stringify(payload),
        encoding: "utf8",
        env: environment,
    });
    return result.status;
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

test("test_team_leader_reason_lists_only_tasks_named_in_commit_messages", () => {
    // Scenario: two tasks are open, and a commit message names only one of them.
    const fixture = setUpFixture("pending");
    writeTask(fixture.home, OTHER_OPEN_TASK_NUMBER, "pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "work", tasks: [OPEN_TASK_NUMBER] }));
    // The TeamLeader stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB));
    assert.equal(decision.decision, "block");
    // The reason holds the commit and the named task, and not the other task.
    assert.ok(decision.reason.includes(commitHash));
    assert.ok(decision.reason.includes(`subject ${OPEN_TASK_NUMBER}`));
    assert.ok(!decision.reason.includes(`subject ${OTHER_OPEN_TASK_NUMBER}`));
});

test("test_director_reason_lists_only_tasks_named_in_commit_messages", () => {
    // Scenario: two tasks are open, and a commit message names only one of them.
    const fixture = setUpFixture("pending");
    writeTask(fixture.home, OTHER_OPEN_TASK_NUMBER, "pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "work", tasks: [OPEN_TASK_NUMBER] }));
    // The Director stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, DIRECTOR_JOB));
    assert.equal(decision.decision, "block");
    // The reason holds the commit and the named task, and not the other task.
    assert.ok(decision.reason.includes(commitHash));
    assert.ok(decision.reason.includes(`subject ${OPEN_TASK_NUMBER}`));
    assert.ok(!decision.reason.includes(`subject ${OTHER_OPEN_TASK_NUMBER}`));
});

test("test_team_leader_reason_holds_no_changed_file_names", () => {
    // Scenario: a commit changes second.txt, and its message names the open task.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "work", tasks: [OPEN_TASK_NUMBER] }));
    // The TeamLeader stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB));
    assert.equal(decision.decision, "block");
    // The reason does not name the changed file.
    assert.ok(!decision.reason.includes("second.txt"));
});

// test("test_task_number_in_commit_body_counts_for_team_leader", () => {
//     // Scenario: two tasks are open, and the commit body names only one of them.
//     const fixture = setUpFixture("pending");
//     writeTask(fixture.home, OTHER_OPEN_TASK_NUMBER, "pending");
//     writeTranscript(fixture);
//     makeCommit(fixture.repo, "second.txt", `work\n\nCloses #${OPEN_TASK_NUMBER}`);
//     // The TeamLeader stop is blocked.
//     const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB));
//     assert.equal(decision.decision, "block");
//     // The reason holds the named task, and not the other task.
//     assert.ok(decision.reason.includes(`subject ${OPEN_TASK_NUMBER}`));
//     assert.ok(!decision.reason.includes(`subject ${OTHER_OPEN_TASK_NUMBER}`));
// });

// test("test_longer_number_does_not_match_shorter_task_for_team_leader", () => {
//     // Scenario: the commit message names a task number that starts with the open task number.
//     const fixture = setUpFixture("pending");
//     writeTranscript(fixture);
//     makeCommit(fixture.repo, "second.txt", `work for #${OPEN_TASK_NUMBER}0`);
//     // The TeamLeader stop prints nothing.
//     assert.equal(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB), "");
// });

test("test_team_leader_passes_when_no_commit_names_a_task", () => {
    // Scenario: a commit exists and a task is open, but the commit message names no task.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", "work");
    // The TeamLeader stop prints nothing.
    assert.equal(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB), "");
});

test("test_helper_chat_of_team_gets_no_commit_check", () => {
    // Scenario: a helper chat of a team makes a commit that names the open task.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "work", tasks: [OPEN_TASK_NUMBER] }));
    // The helper stop prints nothing.
    assert.equal(runHook(fixture, {}, TASK_LIST_ID, HELPER_JOB), "");
});

test("test_hash_text_no_longer_names_a_task_for_team_leader", () => {
    // Scenario: a commit message holds #N text for the open task, and no JSON.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", `work for #${OPEN_TASK_NUMBER}`);
    // The TeamLeader stop prints nothing.
    assert.equal(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB), "");
});

test("test_reason_shows_json_subject_value_for_team_leader", () => {
    // Scenario: a commit message is JSON that names the open task.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    const commitHash = makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "fix swap retry", tasks: [OPEN_TASK_NUMBER] }));
    // The TeamLeader stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB));
    assert.equal(decision.decision, "block");
    // The commit line holds the hash and the subject value.
    assert.ok(decision.reason.includes(`commit ${commitHash} fix swap retry`));
    // The reason does not hold the raw JSON.
    assert.ok(!decision.reason.includes("\"tasks\""));
});

test("test_reason_shows_normal_subject_of_non_json_commit_for_team_leader", () => {
    // Scenario: a plain user commit comes first, then a JSON commit that names the open task.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    const userHash = makeCommit(fixture.repo, "first-user.txt", "user work");
    const jsonHash = makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "json work", tasks: [OPEN_TASK_NUMBER] }));
    // The TeamLeader stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, TEAM_LEADER_JOB));
    assert.equal(decision.decision, "block");
    // The reason holds the plain subject line of the user commit.
    assert.ok(decision.reason.includes(`commit ${userHash} user work`));
    // The reason holds the JSON commit.
    assert.ok(decision.reason.includes(jsonHash));
});

test("test_bad_json_commit_message_fails_the_hook_for_team_leader", () => {
    // Scenario: a commit message starts with { but is not valid JSON.
    const fixture = setUpFixture("pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", "{not json");
    // The hook exits with a non-zero status.
    assert.notEqual(runHookAndGetExitStatus(fixture, TEAM_LEADER_JOB), 0);
});

test("test_director_gets_tasks_from_json_commit_message", () => {
    // Scenario: two tasks are open, and a JSON commit message names only the second one.
    const fixture = setUpFixture("pending");
    writeTask(fixture.home, OTHER_OPEN_TASK_NUMBER, "pending");
    writeTranscript(fixture);
    makeCommit(fixture.repo, "second.txt", JSON.stringify({ subject: "work", tasks: [OTHER_OPEN_TASK_NUMBER] }));
    // The Director stop is blocked.
    const decision = JSON.parse(runHook(fixture, {}, TASK_LIST_ID, DIRECTOR_JOB));
    assert.equal(decision.decision, "block");
    // The reason holds the named task, and not the other task.
    assert.ok(decision.reason.includes(`subject ${OTHER_OPEN_TASK_NUMBER}`));
    assert.ok(!decision.reason.includes(`subject ${OPEN_TASK_NUMBER}`));
});
