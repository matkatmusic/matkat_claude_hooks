import { parseArgs } from "node:util";

export function parseTeamArguments(args: string[], defaultDirectorModel: string): { name: string; model: string } {
  const parsed = parseArgs({
    args,
    options: {
      name: { type: "string" },
      model: { type: "string", default: defaultDirectorModel },
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

export function wrapShellWord(text: string): string {
  return "'" + text.replaceAll("'", "'\\''") + "'";
}

// zsh -ic loads .zshrc, so the claude() function of init.sh adds the plugin folders.
export function buildDirectorPaneCommand(chatName: string, model: string): string {
  const claudeCommand = `claude --name ${wrapShellWord(chatName)} --model ${wrapShellWord(model)}`;
  return `zsh -ic ${wrapShellWord(claudeCommand)}`;
}
