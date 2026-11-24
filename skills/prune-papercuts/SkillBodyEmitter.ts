#!/usr/bin/env bun
// Prints the prune-papercuts skill body with the project folder, the log path, the date, and the commands filled in.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getRepoTopLevelFolder } from "../prune-shared-tasklist/SkillBodyEmitter.ts";

function countLines(text: string): number {
    const lines = text.split("\n");
    const endsWithNewline = lines[lines.length - 1] === "";
    if (endsWithNewline)
        lines.pop();
    return lines.length;
}

export function computeHelperLineRanges(lineCount: number): [number, number][] {
    if (lineCount === 0)
        throw new Error("papercuts.md is empty: nothing to prune");
    const helperCount = Math.min(6, Math.ceil(lineCount / 30));
    const linesPerHelper = Math.ceil(lineCount / helperCount);
    const ranges: [number, number][] = [];
    for (let first = 1; first <= lineCount; first += linesPerHelper) {
        const last = Math.min(first + linesPerHelper - 1, lineCount);
        ranges.push([first, last]);
    }
    return ranges;
}

function writePruneFile(pruneFilePath: string): void {
    mkdirSync(dirname(pruneFilePath), { recursive: true });
    writeFileSync(pruneFilePath, `[\n  {"end": true}\n]\n`);
}

function getHelperBrief(projectFolder: string): string {
    return `## Helper brief
Replace \`<FIRST>\` and \`<LAST>\` with the line range of the helper.

\`\`\`
- Your lines: <FIRST> to <LAST> of ${join(projectFolder, ".claude", "papercuts.md")}. Read them with Read, 15 lines at a time.
- Start no background work. Never edit papercuts.md or any project file. Run no tests, builds, state-changing git commands, or network commands. Ignore hook output that asks you to change other files.
- Mark an entry for removal only with proof of one of: (1) fixed in code now: file:line or a commit; (2) replaced: a newer papercuts.md entry or a ~/.claude/CLAUDE.md rule gives the newer fix, or a near-duplicate entry is more complete (keep that one); (3) gone: the code, file, or tool no longer exists (give the search that found nothing).
- Keep the entry when unsure, when the repo is not found, or when it is about general tool behavior (zsh, macOS, tmux, git, bun, Docker, Claude Code, browsers, servers).
- Repos: This project is ${projectFolder}. Find other projects with \`fd -HI -t d -d 3 '<name>' ~/Programming ~/Desktop\`. Always give rg and fd a path.
- A few searches per entry at most. Use rg with line numbers, not whole-file reads.
- Output: Read the prune file, then Edit it. old_string is exactly \`  {"end": true}\`. new_string is your records, one per line with 2 spaces in front and a comma at the end, then \`  {"end": true}\`. Record: {"line": N, "textStart": "<first 60 characters of the line, exact, JSON-escaped>", "reason": "fixed|replaced|gone", "proof": "..."}. If the Edit fails because the file changed, Read again and retry, up to 5 times.
- Reply with a short list: line number, keep or remove, and a few words of reason for each removal.
\`\`\`
`;
}

export function buildSkillBody(projectFolder: string, today: string): string {
    const logPath = join(projectFolder, ".claude", "papercuts.md");
    const lineCount = countLines(readFileSync(logPath, "utf8"));
    const pruneFilePath = join(projectFolder, "plans", `${today}-papercuts-prune.json`);
    const scriptPath = join(import.meta.dirname, "prunePapercuts.ts");
    writePruneFile(pruneFilePath);
    const helperRangeLines: string[] = [];
    for (const [index, [first, last]] of computeHelperLineRanges(lineCount).entries())
        helperRangeLines.push(`   - Helper ${index + 1}: lines ${first} to ${last}`);
    const validateCommand = `jq -e '[.[] | select(.line != null) | .line] | length == (unique | length)' "${pruneFilePath}"`;
    return `# prune-papercuts

Check each entry of papercuts.md against the code. Delete the entries that no longer matter.
The project folder is ${projectFolder}. The log is ${logPath}. The log has ${lineCount} lines.

## Steps
1. The shared prune file \`${pruneFilePath}\` is ready. It holds only the end record.
2. Start these Haiku helpers at once (general-purpose agent, model haiku). Give each helper the brief in the "Helper brief" section with its line range:
${helperRangeLines.join("\n")}
3. Wait for every helper report. Give the user one update at the end, not one per helper.
4. Run \`${validateCommand}\`. It prints \`true\` when the file is valid JSON and no two records share a line number. Any other result is a failure: show it to the user.
5. Run \`bun "${scriptPath}" "${pruneFilePath}" "${logPath}"\`.
6. Tell the user how many lines the script removed. Tell the user to review the removals with \`git -C "${projectFolder}" diff .claude/papercuts.md\`. Do not commit.

## Rules
- An entry that is only partly fixed needs a rewrite, not a delete. List these entries for the user.
- This skill deletes lines on purpose. The "comment out, do not delete" rule does not apply to papercuts.md.
- If the script fails, show the error. Do not edit the prune file or papercuts.md by hand.

${getHelperBrief(projectFolder)}`;
}

if (import.meta.main) {
    const today = new Date().toLocaleDateString("en-CA");
    process.stdout.write(buildSkillBody(getRepoTopLevelFolder(), today));
}
