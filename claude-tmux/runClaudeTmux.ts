const isTeamModeRequested = process.argv.slice(2).includes("--team");
if (isTeamModeRequested)
  await import("./teamSession/startClaudeTeam.ts");
else
  await import("./individualSession/startClaudeTmux.ts");
export {};
