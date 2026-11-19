#!/usr/bin/env bun
// import { execFileSync } from "node:child_process";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
// import { writeBlockDecision } from "../shared/sessionTasks.ts";
import { writeBlockDecision } from "../../shared/sessionTasks.ts";
// import { wrapShellWord } from "../shared/chatSwap.ts";
import { DISPATCHER_DIR, getValues, readSettings } from "../../shared/settings.ts";
import { fillTemplate } from "../shared/chatSwap.ts";
import { buildSingleChatEnvironmentFlags, buildSingleChatName, buildSingleChatPaneCommand, openTrackerOfPane, updateTrackerWithNextChatNumber, validateSwapPercentText } from "./singleChat.ts";
// UserPromptSubmit hook: /tmux-new-helper [model] starts a helper chat in a new tmux window.
const HELPER_SUFFIX_PATTERN = / helper \d+$/;

export function stripHelperSuffix(chatName: string): string {
    return chatName.replace(HELPER_SUFFIX_PATTERN, "");
}

const HELPER_COUNTER_SUFFIX_PATTERN = / helper$/;

export function getHelperBaseName(claudeTmuxName: string | undefined, sessionTitle: string | undefined): string {
    // a helper chat has CLAUDE_TMUX_NAME "<base> helper"
    if (claudeTmuxName !== undefined)
        return claudeTmuxName.replace(HELPER_COUNTER_SUFFIX_PATTERN, "");
    // session_title is the chat name in the hook payload.
    if (!sessionTitle)
        throw new Error("The hook payload has no session_title.");
    return stripHelperSuffix(sessionTitle);
}

export function getHelperWorkDirectory(claudeTmuxWorkDirectory: string | undefined, currentDirectory: string): string {
    if (claudeTmuxWorkDirectory !== undefined)
        return claudeTmuxWorkDirectory;
    return currentDirectory;
}

export function getHelperModel(typedModel: string, defaultHelperModel: string): string {
    if (typedModel === "")
        return defaultHelperModel;
    return typedModel;
}

// export function computeNextHelperNumber(windowNames: string[], baseName: string): number {
//     const helperPrefix = `${baseName} helper `;
//     let highestNumber = 0;
//     for (const windowName of windowNames) {
//         if (!windowName.startsWith(helperPrefix))
//             continue;
//         const numberText = windowName.slice(helperPrefix.length);
//         if (!/^\d+$/.test(numberText))
//             continue;
//         highestNumber = Math.max(highestNumber, Number(numberText));
//     }
//     return highestNumber + 1;
// }

// function quoteForShell(text: string): string {
//     return `'${text.replaceAll("'", "'\\''")}'`;
// }

// export function buildClaudeCommand(helperName: string, model: string): string {
//     // let claudeCommand = `claude --name ${quoteForShell(helperName)}`;
//     let claudeCommand = `claude --name ${wrapShellWord(helperName)}`;
//     if (model !== "")
//         // claudeCommand += ` --model ${quoteForShell(model)}`;
//         claudeCommand += ` --model ${wrapShellWord(model)}`;
//     return claudeCommand;
// }

function runTmux(args: string[]): string {
    return execFileSync("tmux", args, { encoding: "utf8" }).trim();
}

export function parseNewHelperArguments(argumentText: string): { helperCount: number; model: string } {
    const words: string[] = [];
    for (const word of argumentText.split(/\s+/)) {
        if (word !== "")
            words.push(word);
    }
    let helperCount = 1;
    if (words.length > 0) {
        const isFirstWordNumber = /^-?\d+$/.test(words[0]);
        if (isFirstWordNumber) {
            helperCount = Number(words[0]);
            words.shift();
        }
    }
    if (helperCount <= 0)
        throw new Error(`/tmux-new-helper needs a number above 0, got ${helperCount}.`);
    if (words.length > 1)
        throw new Error("/tmux-new-helper takes [N] [model]: the number goes first, then one model word.");
    let model = "";
    if (words.length === 1)
        model = words[0];
    return { helperCount, model };
}

export function buildHelperSupervisorPrompt(template: string, supervisorChatName: string, supervisorBaseName: string): string {
    const supervisorHandle = `@${supervisorChatName.split(" ").join("-")}`;
    return fillTemplate(template, { supervisorHandle, supervisorBaseName });
}

// export function startHelperChat(tmuxPane: string, payload: Record<string, string>, model: string): string {
export function startHelperChat(tmuxPane: string, payload: Record<string, string>, model: string, supervisorChatName: string): string {
    // // session_title is the chat name in the hook payload.
    // const chatName = payload.session_title;
    // if (!chatName)
    //     throw new Error("The hook payload has no session_title.");
    // const baseName = stripHelperSuffix(chatName);
    // const windowNames = runTmux(["list-windows", "-t", tmuxPane, "-F", "#W"]).split("\n");
    // const helperName = `${baseName} helper ${computeNextHelperNumber(windowNames, baseName)}`;
    // const windowId = runTmux(["display", "-p", "-t", tmuxPane, "#{window_id}"]);
    // runTmux(["new-window", "-d", "-a", "-t", windowId, "-n", helperName, "-c", payload.cwd, "zsh", "-ic", buildClaudeCommand(helperName, model)]);
    // return `${helperName} is ready. Use /tmux-switch to open it.`;
    // const workDirectory = payload.cwd;
    const workDirectory = getHelperWorkDirectory(process.env.CLAUDE_TMUX_WORK_DIRECTORY, payload.cwd);
    const gitRootResult = spawnSync("git", ["-C", workDirectory, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
    if (gitRootResult.status !== 0)
        throw new Error("/tmux-new-helper must start inside a git repository: the handoff file goes to the .idleState folder of the project root");
    validateSwapPercentText(process.env.CLAUDE_TMUX_SWAP_PERCENT);
    const baseName = getHelperBaseName(process.env.CLAUDE_TMUX_NAME, payload.session_title);
    const helperCounterName = `${baseName} helper`;
    const trackerPath = openTrackerOfPane(tmuxPane, gitRootResult.stdout.trim());
    const helperNumber = updateTrackerWithNextChatNumber(trackerPath, helperCounterName, 0);
    const helperChatName = buildSingleChatName(helperCounterName, helperNumber);
    const values = getValues(readSettings(DISPATCHER_DIR), "claude-tmux");
    const helperModel = getHelperModel(model, values["CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_MODEL"]);
    const swapPercent = process.env.CLAUDE_TMUX_SWAP_PERCENT ?? "";
    const environmentFlags = buildSingleChatEnvironmentFlags(helperCounterName, helperNumber, helperModel, workDirectory, swapPercent);
    // const supervisorPrompt = buildHelperSupervisorPrompt(values["CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_SUPERVISOR_PROMPT"], supervisorChatName, baseName);
    const paneCommand = buildSingleChatPaneCommand(helperChatName, helperModel, "");
    // const paneCommand = buildSingleChatPaneCommand(helperChatName, helperModel, supervisorPrompt);
    const windowId = runTmux(["display", "-p", "-t", tmuxPane, "#{window_id}"]);
    runTmux(["new-window", "-d", "-a", "-t", windowId, "-n", helperChatName, "-c", workDirectory, ...environmentFlags, paneCommand]);
    // return `${helperChatName} is ready.`;
    return helperChatName;
}

export function buildHelpersCreatedNotice(template: string, helperChatNames: string[]): string {
    const helperHandles: string[] = [];
    for (const helperChatName of helperChatNames)
        // helperHandles.push(`@"${helperChatName}"`);
        helperHandles.push(`@${helperChatName.split(" ").join("-")}`);
    return fillTemplate(template, { helperHandles: helperHandles.join(", ") });
}

if (import.meta.main) {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    const prompt = (typeof payload.prompt === "string" ? payload.prompt.trimStart() : "").replace(/^\/[\w-]+:/, "/");
    const isNewHelper = prompt === "/tmux-new-helper" || prompt.startsWith("/tmux-new-helper ");
    if (!isNewHelper)
        process.exit(0);
    const tmuxPane = process.env.TMUX_PANE;
    if (!tmuxPane) {
        writeBlockDecision("Run this inside tmux.");
        process.exit(0);
    }
    const { helperCount, model } = parseNewHelperArguments(prompt.slice("/tmux-new-helper".length).trim());
    const readyLines: string[] = [];
    for (let helperIndex = 0; helperIndex < helperCount; helperIndex++)
        // readyLines.push(startHelperChat(tmuxPane, payload, model));
        // readyLines.push(`${startHelperChat(tmuxPane, payload, model)} is ready.`);
        readyLines.push(`${startHelperChat(tmuxPane, payload, model, payload.session_title)} is ready.`);
    writeBlockDecision(readyLines.join("\n"));
}
