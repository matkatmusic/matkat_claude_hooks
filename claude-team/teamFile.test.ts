import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  buildTeamFilePath,
  findChatWithStatus,
  fillTemplate,
  buildJobValueKey,
  hasOpenDialog,
  buildPaneEnvironmentFlags,
  readTeamFile,
  writeTeamFile,
  lockTeamFile,
  unlockTeamFile,
  inputBoxHoldsMessage,
} = await import("./teamFile.ts");

const sampleTeam = {
  teamName: "feature X",
  workDirectory: "/w",
  chats: [{ job: "planner", chatNumber: 1, chatName: "feature X planner 1", pane: "%1", model: "sonnet", status: "active" as const }],
};

test("test_buildTeamFilePath_encodes_team_name", () => {
  // Scenario: the team name becomes a safe file name.
  // Step: build the path for "feature X/1". Check the exact path.
  assert.equal(buildTeamFilePath("/s", "feature X/1"), "/s/claude-team/feature%20X%2F1.json");
});

test("test_findChatWithStatus_returns_matching_chat", () => {
  // Scenario: job and status both match.
  // Step: look for the active planner. Check that the planner chat comes back.
  assert.equal(findChatWithStatus(sampleTeam, "planner", "active")?.chatName, "feature X planner 1");
});

test("test_findChatWithStatus_returns_undefined_for_other_status", () => {
  // Scenario: the job matches but the status does not.
  // Step: look for the starting planner. Check for undefined.
  assert.equal(findChatWithStatus(sampleTeam, "planner", "starting"), undefined);
});

test("test_fillTemplate_replaces_two_keys", () => {
  // Scenario: two different keys.
  // Step: fill "{a} and {b}". Check the text.
  assert.equal(fillTemplate("{a} and {b}", { a: "1", b: "2" }), "1 and 2");
});

test("test_fillTemplate_replaces_same_key_twice", () => {
  // Scenario: one key twice.
  // Step: fill "{a}{a}". Check the text.
  assert.equal(fillTemplate("{a}{a}", { a: "1" }), "11");
});

test("test_fillTemplate_throws_on_missing_key", () => {
  // Scenario: the template has a key that fields do not have.
  // Step: fill "{a}{b}" with only a. Check that it throws.
  assert.throws(() => fillTemplate("{a}{b}", { a: "1" }));
});

test("test_buildJobValueKey_uses_capitals", () => {
  // Scenario: the job name goes into a settings key.
  // Step: build the model key for planner. Check the key.
  assert.equal(buildJobValueKey("planner", "MODEL"), "CLAUDE_HOOKS_CLAUDE_TEAM_PLANNER_MODEL");
});

test("test_hasOpenDialog_true_for_dialog_text", () => {
  // Scenario: the screen shows "Esc to cancel".
  // Step: check a screen with the text. Check for true.
  assert.equal(hasOpenDialog("Pick one\n  Enter to select · Esc to cancel"), true);
});

test("test_hasOpenDialog_true_for_broken_line", () => {
  // Scenario: a narrow pane breaks the text over two lines.
  // Step: check a screen where one line ends with "Esc to" and the next starts with "cancel". Check for true.
  assert.equal(hasOpenDialog("Enter to select · Esc to\ncancel"), true);
});

test("test_hasOpenDialog_false_without_dialog_text", () => {
  // Scenario: a plain screen.
  // Step: check a screen without the text. Check for false.
  assert.equal(hasOpenDialog("❯ hello"), false);
});

test("test_buildPaneEnvironmentFlags_returns_three_pairs", () => {
  // Scenario: each pane gets three variables.
  // Step: build the flags. Check the exact array.
  assert.deepEqual(buildPaneEnvironmentFlags("feature X", "planner", "feature X planner 1"), [
    "-e", "CLAUDE_TEAM_NAME=feature X",
    "-e", "CLAUDE_TEAM_JOB=planner",
    "-e", "CLAUDE_TEAM_CHAT_NAME=feature X planner 1",
  ]);
});

test("test_writeTeamFile_then_readTeamFile_round_trips", () => {
  // Scenario: a team written to disk comes back equal.
  // Steps: write into a new folder. Read it. Compare.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "sub", "t.json");
  writeTeamFile(teamFilePath, sampleTeam);
  assert.deepEqual(readTeamFile(teamFilePath), sampleTeam);
});

test("test_readTeamFile_throws_when_file_missing", () => {
  // Scenario: no team file.
  // Step: read a path that does not exist. Check that it throws.
  assert.throws(() => readTeamFile(join(tmpdir(), "no-such-team-file.json")));
});

test("test_unlockTeamFile_removes_lock_folder", () => {
  // Scenario: unlock removes the lock folder.
  // Steps: lock. Check the folder exists. Unlock. Check the folder is gone.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  lockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), true);
  unlockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), false);
});

test("test_lockTeamFile_takes_stale_lock", () => {
  // Scenario: a lock folder 60 seconds old is left over from a failed script.
  // Steps: make the folder with an old time stamp. Lock. Check that the lock call returns.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  mkdirSync(`${teamFilePath}.lock`);
  const oldSeconds = Date.now() / 1000 - 60;
  utimesSync(`${teamFilePath}.lock`, oldSeconds, oldSeconds);
  lockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), true);
});

test("test_lockTeamFile_waits_until_unlock", async () => {
  // Scenario: a second process waits while the first holds the lock.
  // Steps: lock here. Start a second process that locks. Wait 0.5 seconds. Unlock. Check that the second process ended after 0.5 seconds.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  lockTeamFile(teamFilePath);
  const startedAt = Date.now();
  const childCode = `const { lockTeamFile } = await import(${JSON.stringify(new URL("./teamFile.ts", import.meta.url).href)}); lockTeamFile(${JSON.stringify(teamFilePath)});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", childCode], { stdio: "inherit" });
  const childEnded = new Promise((resolve) => child.on("exit", resolve));
  await new Promise((resolve) => setTimeout(resolve, 500));
  unlockTeamFile(teamFilePath);
  await childEnded;
  assert.ok(Date.now() - startedAt >= 500);
});

test("test_inputBoxHoldsMessage_true_when_last_prompt_line_holds_text", () => {
  // Scenario: the typed text sits in the input box.
  // Step: check a screen whose last ❯ line holds the text start. Check for true.
  assert.equal(inputBoxHoldsMessage("output\n  ❯ hello world this is a long message\n", "hello world this is a long message"), true);
});

test("test_inputBoxHoldsMessage_false_for_queued_message", () => {
  // Scenario: the message is queued and the box shows placeholder text.
  // Step: check a screen where an earlier ❯ line has the text and the last ❯ line has a placeholder. Check for false.
  assert.equal(inputBoxHoldsMessage("❯ hello world this is a long message\n❯ Press up to edit queued messages\n", "hello world this is a long message"), false);
});

test("test_inputBoxHoldsMessage_false_without_prompt_line", () => {
  // Scenario: no input box on the screen.
  // Step: check a screen with no ❯ line. Check for false.
  assert.equal(inputBoxHoldsMessage("nothing here", "hello"), false);
});
