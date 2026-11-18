import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { buildTeamFilePath, writeTeamFile } from "./teamFile.ts";
import type { Team } from "./teamFile.ts";

function runScriptWithBun(scriptName: string, scriptArguments: string[]) {
  return spawnSync("bun", [`${import.meta.dirname}/${scriptName}`, ...scriptArguments], { encoding: "utf8", cwd: import.meta.dirname, env: { ...process.env, BUN_JSC_useTailCalls: "0" } });
}

test("test_swapFailed_does_not_type_the_fail_notice_into_the_chat", (t) => {
  // Scenario: after a failed team swap, the fail notice must not start a new turn in the old chat.
  // Step 1: start a tmux session whose pane runs cat. Cat shows on screen every character typed into the pane.
  const newSessionResult = spawnSync("tmux", ["new-session", "-d", "-x", "300", "-y", "50", "-P", "-F", "#{session_id} #{pane_id}", "cat"], { encoding: "utf8" });
  assert.equal(newSessionResult.status, 0);
  const [sessionId, pane] = newSessionResult.stdout.trim().split(" ");
  // Step 2: write a team file for a new team. Its job has an old chat in the cat pane (leaving) and a new chat (starting) with no pane.
  const teamName = `swapfailed-test-${process.pid}`;
  const job = "planner";
  const oldChatName = `${teamName} ${job} 1`;
  const oldSessionId = `swap-failed-test-${process.pid}`;
  const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
  const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
  const swapFailedMarkerPath = `${DISPATCHER_DIR}/swap-failed/${oldSessionId}`;
  const team: Team = {
    teamName,
    workDirectory: "/w",
    chats: [
      { job, chatNumber: 1, chatName: oldChatName, pane, model: "sonnet", status: "leaving" },
      { job, chatNumber: 2, chatName: `${teamName} ${job} 2`, pane: "", model: "sonnet", status: "starting" },
    ],
  };
  writeTeamFile(teamFilePath, team);
  // Step 3: when the test ends, kill the session by its id and remove the team file, the lock folder and the swap-failed marker.
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", sessionId]);
    rmSync(teamFilePath, { force: true });
    rmSync(`${teamFilePath}.lock`, { recursive: true, force: true });
    rmSync(swapFailedMarkerPath, { force: true });
  });
  // Step 4: run swapFailed.ts for that team, job, old chat and old session id.
  const result = runScriptWithBun("swapFailed.ts", [teamName, job, oldChatName, oldSessionId]);
  // Step 5: check that the screen of the pane is empty, so nothing was typed into the chat. This check comes first: a cat pane has no input box, so the old code also ends with an error.
  const captureResult = spawnSync("tmux", ["capture-pane", "-p", "-t", pane], { encoding: "utf8" });
  assert.equal(captureResult.status, 0);
  assert.equal(captureResult.stdout.trim(), "");
  // Step 6: check that the script ended with no error.
  assert.equal(result.status, 0, result.stderr);
  // Step 7: check that the swap-failed marker file exists.
  assert.ok(existsSync(swapFailedMarkerPath));
});
