import { existsSync } from "node:fs";
import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildChatName, buildDirectorPaneCommand, parseTeamArguments } from "./teamCommand.ts";
import { buildPaneEnvironmentFlags, buildTeamFilePath, fillTemplate, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const team = parseTeamArguments(process.argv.slice(2), values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_MODEL"]);
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"];
const directorChatName = buildChatName(team.name, directorJob, 1);
const directorPaneCommand = buildDirectorPaneCommand(directorChatName, team.model);
const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], team.name);

if (existsSync(teamFilePath)) {
  const hasSessionCode = tmux_lib.tmux_hasSession(team.name);
  if (hasSessionCode === 0)
    throw new Error(`team ${team.name} already exists: ${teamFilePath}`);
}

const newSessionCommand = ["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}", "-s", team.name, "-c", process.cwd(), ...buildPaneEnvironmentFlags(team.name, directorJob, directorChatName), directorPaneCommand];
const newSessionResult = tmux_lib.run(newSessionCommand, { capture_output: true, text: true, check: true });
const directorPane = newSessionResult.stdout.trim();

writeTeamFile(teamFilePath, {
  teamName: team.name,
  workDirectory: process.cwd(),
  chats: [{ job: directorJob, chatNumber: 1, chatName: directorChatName, pane: directorPane, model: team.model, status: "starting" }],
});

console.log(`Starting ${directorChatName}. Waiting for the chat to be ready.`);
const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(directorPane);
if (readinessCode !== 0)
  throw new Error(`${directorChatName} did not become ready in pane ${directorPane}`);
// A startup notice can clear text typed too early. tests/stranger_session.ts waits the same 6 seconds.
tmux_lib.sleep(6);

const sendInstructions = fillTemplate(values["CLAUDE_HOOKS_CLAUDE_TEAM_SEND_INSTRUCTIONS"], {
  chatName: directorChatName,
  teamName: team.name,
  job: directorJob,
  jobs: `${directorJob},${values["CLAUDE_HOOKS_CLAUDE_TEAM_JOBS"]}`,
  sendScript: `${import.meta.dirname}/sendToJob.ts`,
});
const roleText = `${values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_PROMPT"]}\n${sendInstructions}`;
const sendCode = tmux_lib.tmux_sendAndSubmit(directorPane, roleText);
if (sendCode !== 0)
  throw new Error(`tmux could not send the role text to pane ${directorPane}`);

lockTeamFile(teamFilePath);
const teamFile = readTeamFile(teamFilePath);
teamFile.chats[0].status = "active";
writeTeamFile(teamFilePath, teamFile);
unlockTeamFile(teamFilePath);

const isInsideTmux = process.env.TMUX !== undefined;
if (isInsideTmux) {
  const switchResult = tmux_lib.run(["tmux", "switch-client", "-t", directorPane], { check: false });
  process.exit(switchResult.returncode);
}
const attachResult = tmux_lib.run(["tmux", "attach-session", "-t", directorPane], { check: false });
process.exit(attachResult.returncode);
