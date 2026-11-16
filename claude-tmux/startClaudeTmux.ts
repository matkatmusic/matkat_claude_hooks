import { DISPATCHER_DIR, getValues, readSettings } from "../shared/settings.ts";
import { tmux_lib } from "../tests/external/tmux_lib/tmux_lib.ts";
import { buildSingleChatEnvironmentFlags, buildSingleChatName, buildSingleChatPaneCommand, parseSingleChatArguments } from "./singleChat.ts";

const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
const singleChat = parseSingleChatArguments(process.argv.slice(2), values["CLAUDE_HOOKS_CLAUDE_TMUX_MODEL"]);
const workDirectory = process.cwd();

const gitRootResult = tmux_lib.run(["git", "-C", workDirectory, "rev-parse", "--show-toplevel"], { capture_output: true, text: true, check: false });
if (gitRootResult.returncode !== 0)
  throw new Error("claude-tmux must start inside a git repository: the handoff file goes to the .idleState folder of the project root");
const hasSessionCode = tmux_lib.tmux_hasSession(singleChat.name);
if (hasSessionCode === 0)
  throw new Error(`a tmux session named ${singleChat.name} already exists`);

const firstChatName = buildSingleChatName(singleChat.name, 1);
const environmentFlags = buildSingleChatEnvironmentFlags(singleChat.name, 1, singleChat.model, workDirectory);
const paneCommand = buildSingleChatPaneCommand(firstChatName, singleChat.model, "");
const newSessionCommand = ["tmux", "new-session", "-d", "-P", "-F", "#{pane_id}", "-s", singleChat.name, "-c", workDirectory, ...environmentFlags, paneCommand];
const newSessionResult = tmux_lib.run(newSessionCommand, { capture_output: true, text: true, check: true });
const firstPane = newSessionResult.stdout.trim();
console.log(`Started ${firstChatName} in the tmux session ${singleChat.name}.`);

if (process.stdout.isTTY) {
  const isInsideTmux = process.env.TMUX !== undefined;
  if (isInsideTmux) {
    const switchResult = tmux_lib.run(["tmux", "switch-client", "-t", firstPane], { check: false });
    process.exit(switchResult.returncode);
  }
  const attachResult = tmux_lib.run(["tmux", "attach-session", "-t", firstPane], { check: false });
  process.exit(attachResult.returncode);
}
