import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
// import { mkdtempSync } from "node:fs";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { startHelperChats, listHelperWindowJobs } = await import("./teamStart.ts");
const { writeTeamFile } = await import("./teamFile.ts");

test("test_startHelperChats_throws_when_a_helper_chat_exists", () => {
  // Scenario: the team file already has a chat for one of the helper roles.
  // Step 1: write a team file with a Planner chat.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-start-")), "team.json");
  writeTeamFile(teamFilePath, { teamName: "t", workDirectory: "/w", chats: [{ job: "Planner", chatNumber: 1, chatName: "t Planner 1", pane: "%1", model: "sonnet", status: "active" }] });
  // Step 2: start the helper chats. Check that it throws before any pane starts.
  assert.throws(() => startHelperChats(teamFilePath, "%0", { CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS: "Read-Find-orchestrator,Planner" }), /the helper chats already exist/);
});

// findWindowWithFreeSlot is no longer used: fixed window groups replace it.
// test("test_findWindowWithFreeSlot_returns_the_window_that_has_room", () => {
//   // Scenario: one window has fewer panes than the limit.
//   // Step: ask for a free window. Check that it is the one window.
//   assert.equal(findWindowWithFreeSlot(["@1 2"], 3), "@1");
// });
//
// test("test_findWindowWithFreeSlot_skips_a_full_window", () => {
//   // Scenario: the first window is full and the second has room.
//   // Step: ask for a free window. Check that it is the second window.
//   assert.equal(findWindowWithFreeSlot(["@1 3", "@2 1"], 3), "@2");
// });
//
// test("test_findWindowWithFreeSlot_returns_undefined_when_every_window_is_full", () => {
//   // Scenario: every window has the maximum number of panes.
//   // Step: ask for a free window. Check that the answer is undefined.
//   assert.equal(findWindowWithFreeSlot(["@1 3", "@2 3"], 3), undefined);
// });
//
// test("test_findWindowWithFreeSlot_returns_the_first_window_that_has_room", () => {
//   // Scenario: two windows have room.
//   // Step: ask for a free window. Check that it is the earlier one.
//   assert.equal(findWindowWithFreeSlot(["@1 3", "@2 2", "@3 1"], 3), "@2");
// });

test("test_listHelperWindowJobs_returns_the_roles_of_each_window", () => {
  // Scenario: the settings value has two lines, one for each window.
  // Step: list the window jobs. Check that each line gives one array of role names.
  assert.deepEqual(listHelperWindowJobs({ CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HELPER_WINDOWS: "Read-Find-orchestrator,Planner,PlanReviewer\nPlanAuditor,Build-orchestrator" }), [["Read-Find-orchestrator", "Planner", "PlanReviewer"], ["PlanAuditor", "Build-orchestrator"]]);
});

test("test_listHelperWindowJobs_returns_one_window_for_one_line", () => {
  // Scenario: the settings value has one line with one role.
  // Step: list the window jobs. Check that the answer is one window with that role.
  assert.deepEqual(listHelperWindowJobs({ CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HELPER_WINDOWS: "Planner" }), [["Planner"]]);
});

function runScriptAs(scriptName: string, scriptArguments: string[], job: string) {
  return spawnSync("node", [`${import.meta.dirname}/${scriptName}`, ...scriptArguments], { encoding: "utf8", env: { ...process.env, CLAUDE_TMUX_TEAM_NAME: "t", CLAUDE_TMUX_TEAM_JOB: job, CLAUDE_TMUX_TEAM_CHAT_NAME: `t ${job} 1` } });
}

test("test_leadJobDirectly_throws_for_a_chat_that_is_not_the_director", () => {
  // Scenario: only the Director leads a job directly.
  // Step: run the script as a Planner with one argument. Check the message.
  const result = runScriptAs("leadJobDirectly.ts", ["JOB"], "Planner");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only the Director can run leadJobDirectly.ts/);
});

test("test_leadJobDirectly_throws_without_exactly_one_argument", () => {
  // Scenario: the script needs the job text.
  // Step: run the script as the Director with no argument. Check the message.
  const result = runScriptAs("leadJobDirectly.ts", [], "Director");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: leadJobDirectly.ts/);
});

test("test_startJobTeam_throws_for_a_chat_that_is_not_the_director", () => {
  // Scenario: only the Director starts job teams.
  // Step: run the script as a Planner with two arguments. Check the message.
  const result = runScriptAs("startJobTeam.ts", ["jobA", "JOB"], "Planner");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only the Director can run startJobTeam.ts/);
});

test("test_startJobTeam_throws_without_exactly_two_arguments", () => {
  // Scenario: the script needs the job name and the job text.
  // Step: run the script as the Director with one argument. Check the message.
  const result = runScriptAs("startJobTeam.ts", ["jobA"], "Director");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /usage: startJobTeam.ts/);
});

test("test_startTeamHelpers_throws_for_a_chat_that_is_not_the_director", () => {
  // Scenario: only the Director starts the helper chats.
  // Step 1: run the script as a Planner chat.
  const result = spawnSync("node", [`${import.meta.dirname}/startTeamHelpers.ts`], { encoding: "utf8", env: { ...process.env, CLAUDE_TMUX_TEAM_NAME: "t", CLAUDE_TMUX_TEAM_JOB: "Planner" } });
  // Step 2: check that it fails with the message.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /only the Director can start the helper chats/);
});

test("test_startClaudeTeam_throws_outside_a_git_repository", () => {
  // Scenario: the work folder is not inside a git repository. The script must stop before it starts tmux or a chat.
  // Step 1: make a plain folder. Check that git does not see a repository there.
  const plainFolder = mkdtempSync(join(tmpdir(), "claude-team-plain-"));
  assert.notEqual(spawnSync("git", ["-C", plainFolder, "rev-parse"]).status, 0);
  // Step 2: put a fake tmux first on PATH. It fails every call, so no tmux session can start.
  const fakeBinFolder = mkdtempSync(join(tmpdir(), "claude-team-fake-bin-"));
  writeFileSync(join(fakeBinFolder, "tmux"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(fakeBinFolder, "tmux"), 0o755);
  // Step 3: run the script from the plain folder.
  const result = spawnSync("bun", [`${import.meta.dirname}/startClaudeTeam.ts`, "--team", "--name", `claude-team-git-test-${process.pid}`], { encoding: "utf8", cwd: plainFolder, env: { ...process.env, PATH: `${fakeBinFolder}:${process.env.PATH}`, BUN_JSC_useTailCalls: "0" } });
  // Step 4: check that it fails with the message.
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must start inside a git repository/);
});
