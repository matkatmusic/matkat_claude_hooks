import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";

const { writeTeamFile, buildTeamFilePath, buildTranscriptDirectory } = await import("./teamFile.ts");

test("test_closeJobTeam_closes_a_job_team_session_whose_name_has_a_dot", (t) => {
  // Scenario: the Director closes a job team whose tmux session name has a dot in it.
  // Step 1: make a git folder for the job team. Kill nothing yet: the cleanup runs when the test ends.
  const workDirectory = realpathSync(mkdtempSync(join(tmpdir(), "close-job-team-")));
  assert.equal(spawnSync("git", ["init"], { encoding: "utf8", cwd: workDirectory }).status, 0);
  const teamName = `cjt.test-${process.pid}`;
  const jobTeamName = `${teamName} JOB`;
  const teamLeaderChatName = `${jobTeamName} Planner 1`;
  const teamLeaderSessionId = "11111111-2222-3333-4444-555555555555";
  // Step 2: start a tmux session with the job team name. Its one pane acts as the team leader chat: it shows a prompt, and each line it reads makes it write a handoff file.
  const handoffFilePath = `${workDirectory}/.idleState/handoff-${teamLeaderSessionId.slice(0, 8)}.json`;
  mkdirSync(`${workDirectory}/.idleState`);
  const leaderScript = `while true; do printf '❯ '; IFS= read -r line; touch '${handoffFilePath}'; done`;
  const newSessionResult = spawnSync("tmux", ["new-session", "-d", "-P", "-F", "#{session_id} #{pane_id}", "-s", jobTeamName, "bash", "-c", leaderScript], { encoding: "utf8" });
  assert.equal(newSessionResult.status, 0);
  const [jobTeamSessionId, leaderPane] = newSessionResult.stdout.trim().split(" ");
  // Step 3: write the team file and the chat record that the script reads. Remove them when the test ends.
  const stateDirectory = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team")["CLAUDE_HOOKS_SESSION_STATE_DIR"];
  const jobTeamFilePath = buildTeamFilePath(stateDirectory, jobTeamName);
  writeTeamFile(jobTeamFilePath, { teamName: jobTeamName, workDirectory, parentTeam: teamName, chats: [{ job: "Planner", chatNumber: 1, chatName: teamLeaderChatName, pane: leaderPane, model: "sonnet", status: "active", isTeamLeader: true }] });
  const transcriptDirectory = buildTranscriptDirectory(`${homedir()}/.claude/projects`, workDirectory);
  mkdirSync(transcriptDirectory, { recursive: true });
  writeFileSync(`${transcriptDirectory}/${teamLeaderSessionId}.jsonl`, `{"customTitle":${JSON.stringify(teamLeaderChatName)}}\n`);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", jobTeamSessionId]);
    rmSync(jobTeamFilePath, { force: true });
    rmSync(transcriptDirectory, { recursive: true, force: true });
    rmSync(workDirectory, { recursive: true, force: true });
  });
  // Step 4: run closeJobTeam.ts as the Director of the parent team.
  const result = spawnSync("bun", [`${import.meta.dirname}/closeJobTeam.ts`, "JOB"], { encoding: "utf8", env: { ...process.env, BUN_JSC_useTailCalls: "0", CLAUDE_TMUX_TEAM_NAME: teamName, CLAUDE_TMUX_TEAM_JOB: "Director" } });
  // Step 5: check that the script succeeded and the job team session is gone.
  assert.equal(result.status, 0, result.stderr);
  const sessionListResult = spawnSync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf8" });
  assert.equal(sessionListResult.stdout.split("\n").includes(jobTeamName), false);
});
