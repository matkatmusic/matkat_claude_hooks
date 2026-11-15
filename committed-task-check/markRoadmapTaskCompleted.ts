#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync } from "node:fs";
// Usage: bun markRoadmapTaskCompleted.ts <roadmap file> <task number>
// Edits the value on the element's own line, so every other byte of the file stays the same.

const EMPTY_COMPLETED_PATTERN = /("completed"\s*:\s*)""(\s*\}\s*,?\s*)$/;

export function formatUtcTime(date: Date): string {
    return date.toISOString().slice(0, 19) + "Z";
}

export function completeRoadmapTask(roadmapText: string, taskNumber: number, completedTime: string): { text: string; message: string } {
    const elements = JSON.parse(roadmapText);
    let elementIndex = -1;
    for (const [index, element] of elements.entries()) {
        if (element.taskNumber === taskNumber) {
            elementIndex = index;
            break;
        }
    }
    const hasElement = elementIndex !== -1;
    if (!hasElement)
        return { text: roadmapText, message: `Roadmap: no element for task #${taskNumber}, file not changed.` };
    const isAlreadyCompleted = elements[elementIndex].completed !== "";
    if (isAlreadyCompleted)
        return { text: roadmapText, message: `Roadmap: task #${taskNumber} is already completed at ${elements[elementIndex].completed}, file not changed.` };
    const lines = roadmapText.split("\n");
    const lineIndex = elementIndex + 1;
    const taskNumberPattern = new RegExp(`"taskNumber"\\s*:\\s*${taskNumber}\\b`);
    const isElementLine = taskNumberPattern.test(lines[lineIndex]);
    if (!isElementLine)
        throw new Error(`Line ${lineIndex + 1} of the roadmap does not hold the element of task #${taskNumber}. The file needs one element per line.`);
    const hasEmptyCompleted = EMPTY_COMPLETED_PATTERN.test(lines[lineIndex]);
    if (!hasEmptyCompleted)
        throw new Error(`Line ${lineIndex + 1} of the roadmap does not end with an empty "completed" value.`);
    lines[lineIndex] = lines[lineIndex].replace(EMPTY_COMPLETED_PATTERN, `$1"${completedTime}"$2`);
    return { text: lines.join("\n"), message: `Roadmap: task #${taskNumber} completed at ${completedTime}` };
}

export function writeRoadmapTaskCompleted(roadmapFile: string, taskNumber: number, completedTime: string): string {
    const fileExists = existsSync(roadmapFile);
    if (!fileExists)
        return `Roadmap: file ${roadmapFile} does not exist, nothing changed.`;
    const result = completeRoadmapTask(readFileSync(roadmapFile, "utf8"), taskNumber, completedTime);
    writeFileSync(roadmapFile, result.text);
    return result.message;
}

if (import.meta.main) {
    const taskNumber = Number(process.argv[3]);
    const isTaskNumberInteger = Number.isInteger(taskNumber);
    if (!isTaskNumberInteger)
        throw new Error(`Task number is not an integer: ${process.argv[3]}`);
    console.log(writeRoadmapTaskCompleted(process.argv[2], taskNumber, formatUtcTime(new Date())));
}
