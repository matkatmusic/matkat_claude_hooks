import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
import { buildDetachedSizeFlags } from "./teamCommand.ts";
import { buildTeamFilePath, findChatWithStatus, readTeamFile } from "./teamFile.ts";
import { startHelperChats } from "./teamStart.ts";

const teamName = process.env.CLAUDE_TMUX_TEAM_NAME;
const job = process.env.CLAUDE_TMUX_TEAM_JOB;
if (teamName === undefined)
  throw new Error("startTeamHelpers.ts must run inside a claude-tmux team chat");
if (job === undefined)
  throw new Error("startTeamHelpers.ts must run inside a claude-tmux team chat");

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux-team");
const directorJob = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"];
if (job !== directorJob)
  throw new Error("only the Director can start the helper chats");

const teamFilePath = buildTeamFilePath(values["CLAUDE_HOOKS_SESSION_STATE_DIR"], teamName);
const directorPane = findChatWithStatus(readTeamFile(teamFilePath), directorJob, "active")!.pane;
const clientsResult = tmux_lib.run(["tmux", "list-clients", "-t", directorPane], { capture_output: true, text: true, check: true });
if (clientsResult.stdout.trim() === "")
  tmux_lib.run(["tmux", "resize-window", "-t", directorPane, ...buildDetachedSizeFlags(values)], { check: true });
const helperChatNames = startHelperChats(teamFilePath, directorPane, values);
for (const helperChatName of helperChatNames)
  console.log(helperChatName);
