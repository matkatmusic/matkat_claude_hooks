#!/usr/bin/env bun
import { readFileSync } from "node:fs";

// function removeCoAuthorLines(command: string): string {
//     const wholeLinePattern = /^[ \t]*Co-Authored-By:(?:[^\n<"]*<[^\n>]*>|[^\n"']*)[ \t]*(?:\n|$)/gim;
//     // A line that also holds a quote or other command text: remove only the trailer, so the command stays valid.
//     const sharedLinePattern = /(?<=^[ \t]*|["'])Co-Authored-By:(?:[^\n<"]*<[^\n>]*>|[^\n"']*)/gim;
//     const commandWithoutWholeLines = command.replace(wholeLinePattern, "");
//     return commandWithoutWholeLines.replace(sharedLinePattern, "");
// }

// function printCommandChange(toolInput: object, newCommand: string): void {
//     const hookSpecificOutput = {
//         hookEventName: "PreToolUse",
//         permissionDecision: "allow",
//         permissionDecisionReason: "The Co-Authored-By line was removed from the commit command.",
//         updatedInput: { ...toolInput, command: newCommand },
//     };
//     console.log(JSON.stringify({ hookSpecificOutput }));
// }

function printDenyDecision(): void {
    const hookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: "Remove the Co-Authored-By line from the commit message, then commit again.",
    };
    console.log(JSON.stringify({ hookSpecificOutput }));
}

function main(): void {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const command: string = input.tool_input?.command ?? "";
    const gitCommitPattern = /\bgit\b(\s+-[Cc]\s+\S+)*\s+commit\b/;
    const runsGitCommit = gitCommitPattern.test(command);
    if (!runsGitCommit)
        return;
    // const newCommand = removeCoAuthorLines(command);
    // const isUnchanged = newCommand === command;
    // if (isUnchanged)
    //     return;
    // printCommandChange(input.tool_input, newCommand);
    // const coAuthorLinePattern = /(?<=^[ \t]*|["'])Co-Authored-By:/im;
    const coAuthorLinePattern = /co-authored-by:/i;
    const holdsCoAuthorLine = coAuthorLinePattern.test(command);
    if (!holdsCoAuthorLine)
        return;
    printDenyDecision();
}

if (import.meta.main) {
    main();
}
