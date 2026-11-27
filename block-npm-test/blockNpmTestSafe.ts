import { isRunner } from "./blockNpmTestFind.ts";

// a quoted value can hide the real command behind words that look like a test runner
function containsQuotedAssignment(words: string[]): boolean {
    for (const word of words) {
        const isAssignment = /^\w+=/.test(word);
        if (!isAssignment)
            return false;
        const hasQuote = /["']/.test(word);
        if (hasQuote)
            return true;
    }
    return false;
}

function isSafeSegment(segment: string): boolean {
    const hasShellOperator = /[|&<>()`{}\\]/.test(segment);
    if (hasShellOperator)
        return false;
    // bash splits words only at spaces and tabs
    const words = segment.replace(/^[ \t]+|[ \t]+$/g, "").split(/[ \t]+/);
    const isFolderCommand = new Set(["", "cd", "mkdir"]).has(words[0]);
    if (isFolderCommand)
        return true;
    const hidesCommand = containsQuotedAssignment(words);
    if (hidesCommand)
        return false;
    return isRunner(words);
}

// The hook runs the whole command with no approval, so each part must be cd, mkdir, or a test.
export function isSafeTestCommand(command: string): boolean {
    const commandWithoutErrorRedirect = command.replace(/2>&1(?=[ \t;&\n]|$)/g, " ");
    const segments = commandWithoutErrorRedirect.split(/&&|;|\n/);
    for (const segment of segments) {
        const isSafe = isSafeSegment(segment);
        if (!isSafe)
            return false;
    }
    return true;
}
