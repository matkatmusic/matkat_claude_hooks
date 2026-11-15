#!/usr/bin/env bun
// Collects the facts of the open tasks (task files plus chat logs) into one JSON file for the task-roadmap workflow.
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createInterface } from "node:readline";

export interface FactsArguments {
    taskFolder: string;
    transcriptFolders: string[];
    repoFolders: string[];
    roadmapFile: string;
    factsFile: string;
    fullRun: boolean;
}

export interface RoadmapSession {
    name: string;
    workedOnTask: boolean;
}

export interface RoadmapEntry {
    taskNumber: number;
    started: string;
    session: RoadmapSession[];
    status: string;
    branch: string;
    lastUpdated: string;
    blockedBy: number | string;
    completed: string;
}

export interface TaskFile {
    id: string;
    subject: string;
    description: string;
    status: string;
    blockedBy: string[];
    blocks: string[];
}

interface TaskEvent {
    time: string;
    sessionId: string;
    kind: "create" | "update";
    status: string;
    subject: string;
}

interface PendingCreate {
    time: string;
    sessionId: string;
    subject: string;
}

interface LogFacts {
    sessionTitles: Map<string, string>;
    pendingCreates: Map<string, PendingCreate>;
    eventsByTaskNumber: Map<number, TaskEvent[]>;
}

interface ContentBlock {
    type: string;
    id: string;
    name: string;
    input: { taskId: string | number; status?: string; subject: string };
    tool_use_id: string;
    content: unknown;
}

interface LogRecord {
    type: string;
    customTitle: string;
    sessionId: string;
    timestamp: string;
    message?: { content?: unknown };
}

interface OpenTaskFacts {
    taskNumber: number;
    subject: string;
    description: string;
    listStatus: string;
    blockedBy: string[];
    blocks: string[];
    created: string;
    markedInProgress: string;
    lastEvent: string;
    sessions: RoadmapSession[];
    needsResearch: boolean;
    oldEntry: RoadmapEntry | null;
}

interface ClosedTask {
    taskNumber: number;
    completedAt: string;
}

export interface FactsCounts {
    openCount: number;
    needsResearchCount: number;
    closedCount: number;
    noCreateTimeCount: number;
}

const TASK_LINE_MARKERS = ["TaskCreate", "TaskUpdate", "customTitle", "Task #"];

export function formatRoadmapTime(isoTime: string): string {
    return new Date(isoTime).toISOString().slice(0, 19) + "Z";
}

export function readTaskFiles(taskFolder: string): Map<number, TaskFile> {
    const tasksByNumber = new Map<number, TaskFile>();
    for (const fileName of readdirSync(taskFolder)) {
        const isTaskFile = fileName.endsWith(".json");
        if (!isTaskFile)
            continue;
        const task: TaskFile = JSON.parse(readFileSync(join(taskFolder, fileName), "utf8"));
        tasksByNumber.set(Number(task.id), task);
    }
    return tasksByNumber;
}

function addTaskEvent(logFacts: LogFacts, taskNumber: number, taskEvent: TaskEvent): void {
    const events = logFacts.eventsByTaskNumber.get(taskNumber) ?? [];
    events.push(taskEvent);
    logFacts.eventsByTaskNumber.set(taskNumber, events);
}

function saveToolUse(block: ContentBlock, time: string, sessionId: string, logFacts: LogFacts): void {
    const formattedTime = formatRoadmapTime(time);
    if (block.name === "TaskUpdate") {
        const updateEvent: TaskEvent = { time: formattedTime, sessionId, kind: "update", status: block.input.status ?? "", subject: "" };
        addTaskEvent(logFacts, Number(block.input.taskId), updateEvent);
    }
    if (block.name === "TaskCreate")
        logFacts.pendingCreates.set(block.id, { time: formattedTime, sessionId, subject: block.input.subject });
}

function saveToolResult(block: ContentBlock, logFacts: LogFacts): void {
    const pendingCreate = logFacts.pendingCreates.get(block.tool_use_id);
    if (pendingCreate === undefined)
        return;
    const createdMatch = /Task #(\d+)/.exec(JSON.stringify(block.content));
    if (createdMatch === null)
        return;
    const createEvent: TaskEvent = { time: pendingCreate.time, sessionId: pendingCreate.sessionId, kind: "create", status: "", subject: pendingCreate.subject };
    addTaskEvent(logFacts, Number(createdMatch[1]), createEvent);
}

function saveContentBlocks(content: ContentBlock[], time: string, sessionId: string, logFacts: LogFacts): void {
    for (const block of content) {
        if (block.type === "tool_use")
            saveToolUse(block, time, sessionId, logFacts);
        if (block.type === "tool_result")
            saveToolResult(block, logFacts);
    }
}

function saveLogLine(line: string, sessionId: string, logFacts: LogFacts): void {
    const logRecord: LogRecord = JSON.parse(line);
    if (logRecord.type === "custom-title") {
        logFacts.sessionTitles.set(logRecord.sessionId, logRecord.customTitle);
        return;
    }
    const isRequestBlob = logRecord.type === "api-request-blob";
    if (isRequestBlob)
        return;
    const content = logRecord.message?.content;
    const isBlockList = Array.isArray(content);
    if (isBlockList)
        saveContentBlocks(content, logRecord.timestamp, sessionId, logFacts);
}

function containsTaskMarker(line: string): boolean {
    for (const marker of TASK_LINE_MARKERS) {
        const hasMarker = line.includes(marker);
        if (hasMarker)
            return true;
    }
    return false;
}

async function scanLogFile(filePath: string, logFacts: LogFacts): Promise<void> {
    const sessionId = basename(filePath, ".jsonl");
    const lineReader = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
    for await (const line of lineReader) {
        const isLineOfInterest = containsTaskMarker(line);
        if (isLineOfInterest)
            saveLogLine(line, sessionId, logFacts);
    }
}

async function scanLogFolders(transcriptFolders: string[]): Promise<LogFacts> {
    const logFacts: LogFacts = { sessionTitles: new Map(), pendingCreates: new Map(), eventsByTaskNumber: new Map() };
    for (const transcriptFolder of transcriptFolders) {
        for (const fileName of readdirSync(transcriptFolder)) {
            const isLogFile = fileName.endsWith(".jsonl");
            if (isLogFile)
                await scanLogFile(join(transcriptFolder, fileName), logFacts);
        }
    }
    return logFacts;
}

function readOldRoadmap(roadmapFile: string): Map<number, RoadmapEntry> {
    const oldEntries = new Map<number, RoadmapEntry>();
    const roadmapExists = existsSync(roadmapFile);
    if (!roadmapExists)
        return oldEntries;
    const entries: RoadmapEntry[] = JSON.parse(readFileSync(roadmapFile, "utf8"));
    for (const entry of entries)
        oldEntries.set(entry.taskNumber, entry);
    return oldEntries;
}

function compareTaskEvents(first: TaskEvent, second: TaskEvent): number {
    return first.time.localeCompare(second.time);
}

function compareTaskFiles(first: TaskFile, second: TaskFile): number {
    return Number(first.id) - Number(second.id);
}

function selectEventsOfTask(events: TaskEvent[], task: TaskFile): TaskEvent[] {
    const selectedEvents: TaskEvent[] = [];
    for (const taskEvent of events) {
        const isForeignCreate = taskEvent.kind === "create" && taskEvent.subject !== task.subject;
        if (!isForeignCreate)
            selectedEvents.push(taskEvent);
    }
    selectedEvents.sort(compareTaskEvents);
    return selectedEvents;
}

function findFirstTime(events: TaskEvent[], kind: string, status: string): string {
    for (const taskEvent of events) {
        const isMatch = taskEvent.kind === kind && taskEvent.status === status;
        if (isMatch)
            return taskEvent.time;
    }
    return "";
}

function findLastTime(events: TaskEvent[], kind: string, status: string): string {
    let lastTime = "";
    for (const taskEvent of events) {
        const isMatch = taskEvent.kind === kind && taskEvent.status === status;
        if (isMatch)
            lastTime = taskEvent.time;
    }
    return lastTime;
}

function findSessionByName(sessions: RoadmapSession[], name: string): RoadmapSession | undefined {
    for (const session of sessions) {
        if (session.name === name)
            return session;
    }
    return undefined;
}

function buildSessions(events: TaskEvent[], sessionTitles: Map<string, string>): RoadmapSession[] {
    const sessions: RoadmapSession[] = [];
    for (const taskEvent of events) {
        const name = sessionTitles.get(taskEvent.sessionId) ?? taskEvent.sessionId.slice(0, 8);
        const knownSession = findSessionByName(sessions, name);
        const session = knownSession ?? { name, workedOnTask: false };
        if (taskEvent.kind === "update")
            session.workedOnTask = true;
        if (knownSession === undefined)
            sessions.push(session);
    }
    return sessions;
}

function readNewestBranchCommitTime(repoFolder: string, branch: string): string {
    const output = execFileSync("git", ["-C", repoFolder, "for-each-ref", "--format=%(committerdate:iso-strict)", `refs/heads/${branch}`], { encoding: "utf8" });
    let newestTime = "";
    for (const line of output.split("\n")) {
        const newestCandidate = line === "" ? "" : formatRoadmapTime(line);
        if (newestCandidate > newestTime)
            newestTime = newestCandidate;
    }
    return newestTime;
}

function isBranchCommitNewer(oldEntry: RoadmapEntry, repoFolders: string[]): boolean {
    if (oldEntry.branch === "")
        return false;
    for (const repoFolder of repoFolders) {
        const newestTime = readNewestBranchCommitTime(repoFolder, oldEntry.branch);
        if (newestTime > oldEntry.lastUpdated)
            return true;
    }
    return false;
}

function containsCommitMentioningTask(taskNumber: number, lastUpdated: string, repoFolders: string[]): boolean {
    // ponytail: a number can belong to another list, a wrong hit only costs research
    const gitArguments = ["log", "--all", "-E", `--grep=#${taskNumber}([^0-9]|$)`, "--format=%H", "-1"];
    if (lastUpdated !== "")
        gitArguments.push(`--since=${lastUpdated}`);
    for (const repoFolder of repoFolders) {
        const output = execFileSync("git", ["-C", repoFolder, ...gitArguments], { encoding: "utf8" });
        if (output !== "")
            return true;
    }
    return false;
}

function isResearchNeededWithoutGit(lastEvent: string, oldEntry: RoadmapEntry, openTaskNumbers: Set<number>): boolean {
    const isEventNewer = lastEvent > oldEntry.lastUpdated;
    const isBlockerNumber = typeof oldEntry.blockedBy === "number";
    const isBlockerGone = isBlockerNumber && !openTaskNumbers.has(oldEntry.blockedBy as number);
    return isEventNewer || isBlockerGone;
}

function isResearchNeeded(taskNumber: number, lastEvent: string, oldEntry: RoadmapEntry | null, args: FactsArguments, openTaskNumbers: Set<number>): boolean {
    if (args.fullRun)
        return true;
    if (oldEntry === null)
        return true;
    const needsResearchWithoutGit = isResearchNeededWithoutGit(lastEvent, oldEntry, openTaskNumbers);
    if (needsResearchWithoutGit)
        return true;
    const hasBranchCommit = isBranchCommitNewer(oldEntry, args.repoFolders);
    if (hasBranchCommit)
        return true;
    return containsCommitMentioningTask(taskNumber, oldEntry.lastUpdated, args.repoFolders);
}

function listOpenTasks(tasksByNumber: Map<number, TaskFile>): TaskFile[] {
    const openTasks: TaskFile[] = [];
    for (const task of tasksByNumber.values()) {
        if (task.status !== "completed")
            openTasks.push(task);
    }
    openTasks.sort(compareTaskFiles);
    return openTasks;
}

function buildOpenTaskFact(task: TaskFile, args: FactsArguments, logFacts: LogFacts, oldEntries: Map<number, RoadmapEntry>, openTaskNumbers: Set<number>): OpenTaskFacts {
    const taskNumber = Number(task.id);
    const events = selectEventsOfTask(logFacts.eventsByTaskNumber.get(taskNumber) ?? [], task);
    const lastEvent = events.length === 0 ? "" : events[events.length - 1].time;
    const oldEntry = oldEntries.get(taskNumber) ?? null;
    const needsResearch = isResearchNeeded(taskNumber, lastEvent, oldEntry, args, openTaskNumbers);
    const created = findFirstTime(events, "create", "");
    const markedInProgress = findFirstTime(events, "update", "in_progress");
    const sessions = buildSessions(events, logFacts.sessionTitles);
    return { taskNumber, subject: task.subject, description: task.description, listStatus: task.status, blockedBy: task.blockedBy, blocks: task.blocks, created, markedInProgress, lastEvent, sessions, needsResearch, oldEntry };
}

function listOpenTaskFacts(args: FactsArguments, openTasks: TaskFile[], logFacts: LogFacts, oldEntries: Map<number, RoadmapEntry>): OpenTaskFacts[] {
    const openTaskNumbers = new Set<number>();
    for (const task of openTasks)
        openTaskNumbers.add(Number(task.id));
    const openTaskFacts: OpenTaskFacts[] = [];
    for (const task of openTasks)
        openTaskFacts.push(buildOpenTaskFact(task, args, logFacts, oldEntries, openTaskNumbers));
    return openTaskFacts;
}

function isClosedSinceLastRun(oldEntry: RoadmapEntry, tasksByNumber: Map<number, TaskFile>): boolean {
    if (oldEntry.completed !== "")
        return false;
    const task = tasksByNumber.get(oldEntry.taskNumber);
    const isStillOpen = task !== undefined && task.status !== "completed";
    return !isStillOpen;
}

function listClosedSinceLastRun(oldEntries: Map<number, RoadmapEntry>, tasksByNumber: Map<number, TaskFile>, logFacts: LogFacts): ClosedTask[] {
    const nowTime = formatRoadmapTime(new Date().toISOString());
    const closedTasks: ClosedTask[] = [];
    for (const oldEntry of oldEntries.values()) {
        const isClosed = isClosedSinceLastRun(oldEntry, tasksByNumber);
        if (!isClosed)
            continue;
        const events = logFacts.eventsByTaskNumber.get(oldEntry.taskNumber) ?? [];
        const completedAt = findLastTime(events, "update", "completed") || nowTime;
        closedTasks.push({ taskNumber: oldEntry.taskNumber, completedAt });
    }
    return closedTasks;
}

export async function collectTaskFacts(args: FactsArguments): Promise<FactsCounts> {
    const tasksByNumber = readTaskFiles(args.taskFolder);
    const logFacts = await scanLogFolders(args.transcriptFolders);
    const oldEntries = readOldRoadmap(args.roadmapFile);
    const openTasks = listOpenTasks(tasksByNumber);
    const openTaskFacts = listOpenTaskFacts(args, openTasks, logFacts, oldEntries);
    const closedSinceLastRun = listClosedSinceLastRun(oldEntries, tasksByNumber, logFacts);
    mkdirSync(dirname(args.factsFile), { recursive: true });
    writeFileSync(args.factsFile, JSON.stringify({ openTasks: openTaskFacts, closedSinceLastRun }, null, 2));
    return countFacts(openTaskFacts, closedSinceLastRun);
}

function countFacts(openTaskFacts: OpenTaskFacts[], closedSinceLastRun: ClosedTask[]): FactsCounts {
    let needsResearchCount = 0;
    let noCreateTimeCount = 0;
    for (const openTaskFact of openTaskFacts) {
        if (openTaskFact.needsResearch)
            needsResearchCount++;
        if (openTaskFact.created === "")
            noCreateTimeCount++;
    }
    return { openCount: openTaskFacts.length, needsResearchCount, closedCount: closedSinceLastRun.length, noCreateTimeCount };
}

if (import.meta.main) {
    const counts = await collectTaskFacts(JSON.parse(process.argv[2]));
    process.stdout.write(`open ${counts.openCount}, needsResearch ${counts.needsResearchCount}, closedSinceLastRun ${counts.closedCount}, no create time ${counts.noCreateTimeCount}\n`);
}
