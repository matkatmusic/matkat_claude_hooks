import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildChatName, buildDirectorPaneCommand, parseTeamArguments } from "./teamCommand.ts";

const values = getValues(readSettings(DISPATCHER_DIR), "claude-team");
const team = parseTeamArguments(process.argv.slice(2), values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_MODEL"]);
const directorChatName = buildChatName(team.name, values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_JOB"], 1);
const directorPaneCommand = buildDirectorPaneCommand(directorChatName, team.model);

const newSessionCommand = ["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}", "-s", team.name, "-c", process.cwd(), directorPaneCommand];
const newSessionResult = tmux_lib.run(newSessionCommand, { capture_output: true, text: true, check: true });
const directorPane = newSessionResult.stdout.trim();

console.log(`Starting ${directorChatName}. Waiting for the chat to be ready.`);
const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(directorPane);
if (readinessCode !== 0)
  throw new Error(`${directorChatName} did not become ready in pane ${directorPane}`);
// A startup notice can clear text typed too early. tests/stranger_session.ts waits the same 6 seconds.
tmux_lib.sleep(6);

const sendCode = tmux_lib.tmux_sendAndSubmit(directorPane, values["CLAUDE_HOOKS_CLAUDE_TEAM_DIRECTOR_PROMPT"]);
if (sendCode !== 0)
  throw new Error(`tmux could not send the role text to pane ${directorPane}`);

const attachResult = tmux_lib.run(["tmux", "attach-session", "-t", directorPane], { check: false });
process.exit(attachResult.returncode);
