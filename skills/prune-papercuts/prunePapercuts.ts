// Removes the papercuts.md lines that the prune JSON marks, after checking every record.
import { readFileSync, writeFileSync } from "node:fs";

export interface RemovalRecord {
    line: number;
    textStart: string;
    reason: string;
    proof: string;
}

export function readRemovalRecords(pruneJsonPath: string): RemovalRecord[] {
    const elements: Record<string, unknown>[] = JSON.parse(readFileSync(pruneJsonPath, "utf8"));
    const records: RemovalRecord[] = [];
    for (const element of elements) {
        const hasLineNumber = typeof element.line === "number";
        if (!hasLineNumber)
            continue;
        records.push(element as unknown as RemovalRecord);
    }
    return records;
}

export function removeLeadingDash(text: string): string {
    const hasLeadingDash = text.startsWith("- ");
    if (hasLeadingDash)
        return text.slice(2);
    return text;
}

export function validateRemovalRecordMatchesLine(record: RemovalRecord, lines: string[]): void {
    const isBeforeStart = record.line < 1;
    const isPastEnd = record.line > lines.length;
    if (isBeforeStart)
        throw new Error(`line ${record.line} is outside the file (${lines.length} lines)`);
    if (isPastEnd)
        throw new Error(`line ${record.line} is outside the file (${lines.length} lines)`);
    const lineText = removeLeadingDash(lines[record.line - 1]);
    const expectedStart = removeLeadingDash(record.textStart);
    const isMatch = lineText.startsWith(expectedStart);
    if (!isMatch)
        throw new Error(`line ${record.line} does not start with "${record.textStart}": found "${lines[record.line - 1]}"`);
}

export function collectMarkedLineNumbers(lines: string[], records: RemovalRecord[]): Set<number> {
    const markedLineNumbers = new Set<number>();
    for (const record of records) {
        validateRemovalRecordMatchesLine(record, lines);
        const isDuplicate = markedLineNumbers.has(record.line);
        if (isDuplicate)
            throw new Error(`line ${record.line} appears in two records`);
        markedLineNumbers.add(record.line);
    }
    return markedLineNumbers;
}

export function removeMarkedLines(lines: string[], records: RemovalRecord[]): string[] {
    const markedLineNumbers = collectMarkedLineNumbers(lines, records);
    const keptLines: string[] = [];
    for (let index = 0; index < lines.length; index++) {
        const isMarked = markedLineNumbers.has(index + 1);
        if (!isMarked)
            keptLines.push(lines[index]);
    }
    return keptLines;
}

export function removeMarkedLinesFromFile(pruneJsonPath: string, papercutsPath: string): void {
    const records = readRemovalRecords(pruneJsonPath);
    const lines = readFileSync(papercutsPath, "utf8").split("\n");
    const hasTrailingNewline = lines[lines.length - 1] === "";
    if (hasTrailingNewline)
        lines.pop();
    const keptLines = removeMarkedLines(lines, records);
    writeFileSync(papercutsPath, keptLines.join("\n") + "\n");
    console.log(`removed ${lines.length - keptLines.length} lines`);
    console.log(`old line count: ${lines.length}`);
    console.log(`new line count: ${keptLines.length}`);
}

if (import.meta.main)
    removeMarkedLinesFromFile(process.argv[2], process.argv[3]);
