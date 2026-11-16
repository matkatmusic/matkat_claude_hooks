#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeBlockDecision } from "../shared/session-tasks.ts";
// UserPromptSubmit hook: /tmux-switch opens the tmux chat list, /tmux-new-helper [model] starts a helper chat in a new tmux window.
const HELPER_SUFFIX_PATTERN = / helper \d+$/;

export function stripHelperSuffix(chatName: string): string {
    return chatName.replace(HELPER_SUFFIX_PATTERN, "");
}

export function computeNextHelperNumber(windowNames: string[], baseName: string): number {
    const helperPrefix = `${baseName} helper `;
    let highestNumber = 0;
    for (const windowName of windowNames) {
        if (!windowName.startsWith(helperPrefix))
            continue;
        const numberText = windowName.slice(helperPrefix.length);
        if (!/^\d+$/.test(numberText))
            continue;
        highestNumber = Math.max(highestNumber, Number(numberText));
    }
    return highestNumber + 1;
}

function quoteForShell(text: string): string {
    return `'${text.replaceAll("'", "'\\''")}'`;
}

export function buildClaudeCommand(helperName: string, model: string): string {
    let claudeCommand = `claude --name ${quoteForShell(helperName)}`;
    if (model !== "")
        claudeCommand += ` --model ${quoteForShell(model)}`;
    return claudeCommand;
}

function runTmux(args: string[]): string {
    return execFileSync("tmux", args, { encoding: "utf8" }).trim();
}

function switchChat(tmuxPane: string): string {
    runTmux(["choose-tree", "-Zw", "-t", tmuxPane]);
    return "Pick a chat in the tmux list.";
}

function startHelperChat(tmuxPane: string, payload: Record<string, string>, model: string): string {
    // session_title is the chat name in the hook payload.
    const chatName = payload.session_title;
    if (!chatName)
        throw new Error("The hook payload has no session_title.");
    const baseName = stripHelperSuffix(chatName);
    const windowNames = runTmux(["list-windows", "-t", tmuxPane, "-F", "#W"]).split("\n");
    const helperName = `${baseName} helper ${computeNextHelperNumber(windowNames, baseName)}`;
    const windowId = runTmux(["display", "-p", "-t", tmuxPane, "#{window_id}"]);
    runTmux(["new-window", "-d", "-a", "-t", windowId, "-n", helperName, "-c", payload.cwd, "zsh", "-ic", buildClaudeCommand(helperName, model)]);
    return `${helperName} is ready. Use /tmux-switch to open it.`;
}

if (import.meta.main) {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    const prompt = (typeof payload.prompt === "string" ? payload.prompt.trimStart() : "").replace(/^\/[\w-]+:/, "/");
    const isSwitch = prompt === "/tmux-switch" || prompt.startsWith("/tmux-switch ");
    const isNewHelper = prompt === "/tmux-new-helper" || prompt.startsWith("/tmux-new-helper ");
    if (!isSwitch) {
        if (!isNewHelper)
            process.exit(0);
    }
    const tmuxPane = process.env.TMUX_PANE;
    if (!tmuxPane) {
        writeBlockDecision("Run this inside tmux.");
        process.exit(0);
    }
    if (isSwitch) {
        writeBlockDecision(switchChat(tmuxPane));
    }
    else {
        const model = prompt.slice("/tmux-new-helper".length).trim();
        writeBlockDecision(startHelperChat(tmuxPane, payload, model));
    }
}
