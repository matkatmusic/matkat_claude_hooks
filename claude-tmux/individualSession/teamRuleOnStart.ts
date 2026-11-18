#!/usr/bin/env bun
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { fillTemplate } from "../shared/chatSwap.ts";
import { getHelperBaseName } from "./tmuxHelper.ts";
// SessionStart hook: tells a claude-tmux chat its team rule: supervisor of the team, or helper of the team.

export enum TeamRole {
    Main = "main",
    Helper = "helper",
}

export function getTeamRole(claudeTmuxName: string | undefined): { role: TeamRole; baseName: string } | undefined {
    if (claudeTmuxName === undefined)
        return undefined;
    if (claudeTmuxName.endsWith(" helper"))
        return { role: TeamRole.Helper, baseName: getHelperBaseName(claudeTmuxName, undefined) };
    return { role: TeamRole.Main, baseName: claudeTmuxName };
}

export function buildTeamRuleContext(claudeTmuxName: string | undefined, mainRule: string, helperRule: string): string | undefined {
    const teamRole = getTeamRole(claudeTmuxName);
    if (teamRole === undefined)
        return undefined;
    if (teamRole.role === TeamRole.Helper)
        return fillTemplate(helperRule, { baseName: teamRole.baseName });
    return fillTemplate(mainRule, { baseName: teamRole.baseName });
}

if (import.meta.main) {
    const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
    const teamRuleContext = buildTeamRuleContext(process.env.CLAUDE_TMUX_NAME, values["CLAUDE_HOOKS_CLAUDE_TMUX_MAIN_TEAM_RULE"], values["CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_TEAM_RULE"]);
    if (teamRuleContext !== undefined)
        console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: teamRuleContext } }));
}
