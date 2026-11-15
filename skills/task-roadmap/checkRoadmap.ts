#!/usr/bin/env bun
// Checks a roadmap file against the task folder and prints one line per failure.
import { readFileSync } from "node:fs";
import { readTaskFiles } from "./collectTaskFacts.ts";

const ENTRY_KEYS = ["taskNumber", "started", "session", "status", "branch", "lastUpdated", "blockedBy", "completed"];
const SESSION_KEYS = ["name", "workedOnTask"];
const DATE_KEYS = ["started", "lastUpdated", "completed"];
const DATE_PATTERN = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const NUMBER_PATTERN = /\b\d+\b/g;
const EM_DASH = "\u2014";

type RawEntry = Record<string, unknown>;

export interface CheckResult {
    failures: string[];
    proseLines: string[];
}

interface CheckContext {
    entries: RawEntry[];
    positions: Map<number, number>;
    openTaskNumbers: number[];
    failures: string[];
    proseLines: string[];
}

function compareNumbers(first: number, second: number): number {
    return first - second;
}

function listOpenTaskNumbers(taskFolder: string): number[] {
    const openTaskNumbers: number[] = [];
    for (const [taskNumber, task] of readTaskFiles(taskFolder)) {
        if (task.status !== "completed")
            openTaskNumbers.push(taskNumber);
    }
    openTaskNumbers.sort(compareNumbers);
    return openTaskNumbers;
}

function computeTaskNumberPositions(entries: RawEntry[]): Map<number, number> {
    const positions = new Map<number, number>();
    for (const [index, entry] of entries.entries()) {
        const isKnown = positions.has(entry.taskNumber as number);
        if (!isKnown)
            positions.set(entry.taskNumber as number, index);
    }
    return positions;
}

function validateNoDuplicates(context: CheckContext): void {
    const seenTaskNumbers = new Set<number>();
    for (const entry of context.entries) {
        const isDuplicate = seenTaskNumbers.has(entry.taskNumber as number);
        if (isDuplicate)
            context.failures.push(`task ${entry.taskNumber}: duplicate taskNumber`);
        seenTaskNumbers.add(entry.taskNumber as number);
    }
}

function isSessionItemValid(sessionItem: RawEntry): boolean {
    const hasExactKeys = Object.keys(sessionItem).join(",") === SESSION_KEYS.join(",");
    const isNameString = typeof sessionItem.name === "string";
    const isWorkedOnTaskBoolean = typeof sessionItem.workedOnTask === "boolean";
    return hasExactKeys && isNameString && isWorkedOnTaskBoolean;
}

function validateEntryShapes(context: CheckContext): void {
    for (const entry of context.entries) {
        const hasExactKeys = Object.keys(entry).join(",") === ENTRY_KEYS.join(",");
        if (!hasExactKeys)
            context.failures.push(`task ${entry.taskNumber}: keys are not exactly ${ENTRY_KEYS.join(", ")} in that order`);
        for (const sessionItem of entry.session as RawEntry[]) {
            const isValid = isSessionItemValid(sessionItem);
            if (!isValid)
                context.failures.push(`task ${entry.taskNumber}: session item must have exactly name (string) and workedOnTask (boolean)`);
        }
    }
}

function validateDates(context: CheckContext): void {
    for (const entry of context.entries) {
        for (const dateKey of DATE_KEYS) {
            const value = entry[dateKey];
            const isEmpty = value === "";
            const isDateFormat = DATE_PATTERN.test(String(value));
            const isValid = isEmpty || isDateFormat;
            if (!isValid)
                context.failures.push(`task ${entry.taskNumber}: ${dateKey} is not YYYY-MM-DDTHH:MM:SSZ or empty`);
        }
    }
}

function validateCoverage(context: CheckContext): void {
    for (const openTaskNumber of context.openTaskNumbers) {
        const hasElement = context.positions.has(openTaskNumber);
        if (!hasElement)
            context.failures.push(`task ${openTaskNumber}: open task has no element`);
    }
}

function validateCompletedTimes(context: CheckContext): void {
    for (const entry of context.entries) {
        const isOpen = context.openTaskNumbers.includes(entry.taskNumber as number);
        const hasCompletedTime = entry.completed !== "";
        if (isOpen) {
            if (hasCompletedTime)
                context.failures.push(`task ${entry.taskNumber}: open task has a completed time`);
        }
        else {
            if (!hasCompletedTime)
                context.failures.push(`task ${entry.taskNumber}: closed task has no completed time`);
        }
    }
}

function validateIntegerBlocker(entry: RawEntry, index: number, context: CheckContext): void {
    const blockerNumber = entry.blockedBy as number;
    const blockerPosition = context.positions.get(blockerNumber);
    const isBlockerOpen = context.openTaskNumbers.includes(blockerNumber);
    if (blockerNumber === entry.taskNumber)
        context.failures.push(`task ${entry.taskNumber}: blockedBy points at itself`);
    if (!isBlockerOpen)
        context.failures.push(`task ${entry.taskNumber}: blockedBy ${blockerNumber} is not an open task`);
    if (blockerPosition === undefined)
        return;
    if (blockerPosition > index)
        context.failures.push(`task ${entry.taskNumber}: blockedBy ${blockerNumber} comes later in the array`);
}

function collectProseLines(entry: RawEntry, index: number, context: CheckContext): void {
    for (const numberMatch of String(entry.blockedBy).matchAll(NUMBER_PATTERN)) {
        const mentionedNumber = Number(numberMatch[0]);
        const mentionedPosition = context.positions.get(mentionedNumber);
        const isOpenMention = context.openTaskNumbers.includes(mentionedNumber);
        if (!isOpenMention)
            continue;
        if (mentionedPosition === undefined)
            continue;
        if (mentionedPosition > index)
            context.proseLines.push(`prose names later task: ${entry.taskNumber} -> ${mentionedNumber} | ${entry.blockedBy}`);
    }
}

function validateBlockers(context: CheckContext): void {
    for (const [index, entry] of context.entries.entries()) {
        const isOpen = context.openTaskNumbers.includes(entry.taskNumber as number);
        if (!isOpen)
            continue;
        if (typeof entry.blockedBy === "number")
            validateIntegerBlocker(entry, index, context);
        if (typeof entry.blockedBy === "string")
            collectProseLines(entry, index, context);
    }
}

function executeRules(context: CheckContext, roadmapText: string): void {
    context.positions = computeTaskNumberPositions(context.entries);
    validateNoDuplicates(context);
    validateEntryShapes(context);
    validateDates(context);
    validateCoverage(context);
    validateCompletedTimes(context);
    validateBlockers(context);
    const hasEmDash = roadmapText.includes(EM_DASH);
    if (hasEmDash)
        context.failures.push("file contains an em dash");
}

export function validateRoadmap(roadmapFile: string, taskFolder: string): CheckResult {
    const roadmapText = readFileSync(roadmapFile, "utf8");
    const entries = JSON.parse(roadmapText);
    const context: CheckContext = { entries, positions: new Map(), openTaskNumbers: listOpenTaskNumbers(taskFolder), failures: [], proseLines: [] };
    const isArray = Array.isArray(entries);
    if (!isArray) {
        context.failures.push("file is not an array");
        return context;
    }
    executeRules(context, roadmapText);
    return context;
}

if (import.meta.main) {
    const result = validateRoadmap(process.argv[2], process.argv[3]);
    for (const proseLine of result.proseLines)
        process.stdout.write(proseLine + "\n");
    for (const failure of result.failures)
        process.stdout.write(failure + "\n");
    if (result.failures.length === 0)
        process.stdout.write("roadmap check passed\n");
    else
        process.exitCode = 1;
}
