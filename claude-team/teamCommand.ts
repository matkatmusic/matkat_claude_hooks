import { parseArgs } from "node:util";

export function parseTeamArguments(args: string[], defaultDirectorModel: string): { name: string; model: string } {
  const parsed = parseArgs({
    args,
    options: {
      name: { type: "string" },
      model: { type: "string", default: defaultDirectorModel },
      // parent: { type: "string" },
    },
  });
  const name = parsed.values.name;
  if (name === undefined)
    throw new Error('claude-team needs --name "<name>"');
  return { name, model: parsed.values.model };
}

export function buildChatName(teamName: string, job: string, chatNumber: number): string {
  return `${teamName} ${job} ${chatNumber}`;
}

export function buildDetachedSizeFlags(values: Record<string, string>): string[] {
  return ["-x", values["CLAUDE_HOOKS_CLAUDE_TEAM_DETACHED_COLUMNS"], "-y", values["CLAUDE_HOOKS_CLAUDE_TEAM_DETACHED_ROWS"]];
}

export function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

// zsh -ic loads .zshrc, so the claude() function of init.sh adds the plugin folders.
export function buildDirectorPaneCommand(chatName: string, model: string, startingText: string): string {
  let claudeCommand = `claude --name ${wrapShellWord(chatName)} --model ${wrapShellWord(model)}`;
  if (startingText !== "")
    claudeCommand += ` -- ${wrapShellWord(startingText)}`;
  return `zsh -ic ${wrapShellWord(claudeCommand)}`;
}
