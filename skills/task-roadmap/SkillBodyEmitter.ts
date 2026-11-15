#!/usr/bin/env bun
// Prints the task-roadmap skill body with the commands and the Workflow arguments filled in.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { findTaskFolder, TASK_LIST_ID_NOT_SET_REASON } from "../../shared/session-tasks.ts";
import { getRepoTopLevelFolder, listRepoFolders } from "../prune-shared-tasklist/SkillBodyEmitter.ts";
import { readTaskFiles } from "./collectTaskFacts.ts";

export function parseWorktreePaths(porcelainText: string): string[] {
    const worktreePaths: string[] = [];
    for (const line of porcelainText.split("\n")) {
        const isWorktreeLine = line.startsWith("worktree ");
        const isGitDirectory = line.includes("/.git/");
        const isWorktreePath = isWorktreeLine && !isGitDirectory;
        if (isWorktreePath)
            worktreePaths.push(line.slice("worktree ".length));
    }
    return worktreePaths;
}

function appendUnlistedFolders(folders: string[], extraFolders: string[]): string[] {
    const mergedFolders = [...folders];
    for (const extraFolder of extraFolders) {
        const isListed = mergedFolders.includes(extraFolder);
        if (!isListed)
            mergedFolders.push(extraFolder);
    }
    return mergedFolders;
}

function listWorktreePaths(repoFolders: string[]): string[] {
    let worktreePaths: string[] = [];
    for (const repoFolder of repoFolders) {
        const porcelainText = execFileSync("git", ["-C", repoFolder, "worktree", "list", "--porcelain"], { encoding: "utf8" });
        worktreePaths = appendUnlistedFolders(worktreePaths, parseWorktreePaths(porcelainText));
    }
    return worktreePaths;
}

export function isChatInProject(chatFolder: string, projectFolders: string[]): boolean {
    for (const projectFolder of projectFolders) {
        const isSameFolder = chatFolder === projectFolder;
        if (isSameFolder)
            return true;
        const isInsideFolder = chatFolder.startsWith(projectFolder + "/");
        if (isInsideFolder)
            return true;
    }
    return false;
}

function readSessions(sessionsFolder: string): { name?: string; cwd: string }[] {
    const sessions: { name?: string; cwd: string }[] = [];
    for (const fileName of readdirSync(sessionsFolder)) {
        const isSessionFile = fileName.endsWith(".json");
        if (isSessionFile)
            sessions.push(JSON.parse(readFileSync(join(sessionsFolder, fileName), "utf8")));
    }
    return sessions;
}

export function listPeerChatNames(sessionsFolder: string, projectFolders: string[]): string[] {
    const chatNames: string[] = [];
    for (const session of readSessions(sessionsFolder)) {
        if (!session.name)
            continue;
        const isInProject = isChatInProject(session.cwd, projectFolders);
        if (isInProject)
            chatNames.push(session.name);
    }
    return chatNames;
}

function computeProjectFolderName(folder: string): string {
    return folder.replace(/[^a-zA-Z0-9]/g, "-");
}

export function listTranscriptFolders(projectsFolder: string, projectFolders: string[]): string[] {
    const transcriptFolders: string[] = [];
    for (const folderName of readdirSync(projectsFolder)) {
        for (const projectFolder of projectFolders) {
            const isProjectTranscript = folderName.startsWith(computeProjectFolderName(projectFolder));
            if (!isProjectTranscript)
                continue;
            transcriptFolders.push(join(projectsFolder, folderName));
            break;
        }
    }
    return transcriptFolders;
}

function countOpenTasks(taskFolder: string): number {
    let openCount = 0;
    for (const task of readTaskFiles(taskFolder).values()) {
        if (task.status !== "completed")
            openCount++;
    }
    return openCount;
}

function wrapInShellQuotes(text: string): string {
    return "'" + text.replaceAll("'", "'\\''") + "'";
}

function computeWorkFolder(taskFolder: string): string {
    return join(tmpdir(), "task-roadmap", basename(taskFolder));
}

function copyWorkflowScript(repoTopLevelFolder: string): string {
    const copyFolder = join(repoTopLevelFolder, ".claude_hooks", "workflows");
    const copyPath = join(copyFolder, "task-roadmap.workflow.js");
    mkdirSync(copyFolder, { recursive: true });
    copyFileSync(join(import.meta.dirname, "taskRoadmap.workflow.js"), copyPath);
    return copyPath;
}

function buildFactsArguments(taskFolder: string, repoTopLevelFolder: string, projectFolders: string[]) {
    const transcriptFolders = listTranscriptFolders(join(homedir(), ".claude", "projects"), projectFolders);
    const repoFolders = appendUnlistedFolders(listRepoFolders(repoTopLevelFolder), projectFolders);
    const roadmapFile = join(repoTopLevelFolder, "plans", `${basename(taskFolder)}-roadmap.json`);
    const factsFile = join(computeWorkFolder(taskFolder), "facts.json");
    return { taskFolder, transcriptFolders, repoFolders, roadmapFile, factsFile, fullRun: false };
}

function buildCollectFactsCommand(factsArguments: object): string {
    const collectScriptPath = join(import.meta.dirname, "collectTaskFacts.ts");
    return `bun "${collectScriptPath}" ${wrapInShellQuotes(JSON.stringify(factsArguments))}`;
}

function buildJsonBlock(taskFolder: string) {
    const repoTopLevelFolder = getRepoTopLevelFolder();
    const projectFolders = listWorktreePaths(listRepoFolders(repoTopLevelFolder));
    const factsArguments = buildFactsArguments(taskFolder, repoTopLevelFolder, projectFolders);
    const { repoFolders, roadmapFile, factsFile } = factsArguments;
    const checkCommand = `bun "${join(import.meta.dirname, "checkRoadmap.ts")}" "${roadmapFile}" "${taskFolder}"`;
    return {
        scriptPath: copyWorkflowScript(repoTopLevelFolder),
        openCount: countOpenTasks(taskFolder),
        collectFactsCommand: buildCollectFactsCommand(factsArguments),
        checkCommand,
        peerChats: listPeerChatNames(join(homedir(), ".claude", "sessions"), projectFolders),
        args: { taskFolder, repoFolders, roadmapFile, factsFile, workFolder: computeWorkFolder(taskFolder), checkCommand, goal: "", peerAnswers: "", researchTaskNumbers: [] },
    };
}

function getSteps(factsFile: string): string {
    return `## Steps
1. Read the command text at the top. If its first word is \`full\`, change \`"fullRun":false\` to \`"fullRun":true\` in the facts command. Put the rest of the text in \`args.goal\`.
2. Send one message to each chat in \`peerChats\`, except your own chat. Use SendMessage with \`notify_when_idle: true\`. Ask these questions: Which open tasks do you work on? On which branch? What is done? What is left? Which tasks are only notes? Do you prune the task list now? If a chat prunes the task list, wait until it finishes.
3. End your turn to wait. Continue when each chat has answered or its idle notice has arrived. Write "no answer" for a chat that sent only a notice. Put all answers in \`args.peerAnswers\`. A peer answer is evidence. It is not a decision of the user.
4. Run the facts command. Read the counts. Then run \`jq '[.openTasks[] | select(.needsResearch) | .taskNumber]' "${factsFile}"\` and put the numbers in \`args.researchTaskNumbers\`. If that list is empty and the count of closedSinceLastRun is 0, tell the user that the roadmap needs no change. Then stop.
5. Tell the user one line about the cost: one Haiku helper for each 40 tasks to research, 3 Sonnet helpers, and 3 Opus helpers. Then call the Workflow tool with \`scriptPath\` and \`args\`. Launch it at once. This skill is the opt-in of the user.
6. When the workflow finishes, run \`checkCommand\` yourself. Report these items: pass or fail, the open count, the researched count, the closed count, each "prose names later task" line, each fault of the final check, and the \`goalWorkWithNoTask\` list apart from the file. Do not stage or commit.
`;
}

export function buildSkillBody(): string {
    const taskFolder = findTaskFolder();
    if (taskFolder === undefined)
        return TASK_LIST_ID_NOT_SET_REASON + "\n";
    const jsonBlock = buildJsonBlock(taskFolder);
    const jsonText = JSON.stringify(jsonBlock, null, 2);
    return `# task-roadmap\n\n\`\`\`json\n${jsonText}\n\`\`\`\n\n${getSteps(jsonBlock.args.factsFile)}`;
}

if (import.meta.main)
    process.stdout.write(buildSkillBody());
