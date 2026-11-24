#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname } from "node:path";

// PreToolUse hook (Write|Edit): plans in a plans/ folder are <name>.plan.json files, so jq can read their sections.
// Other .json files in plans/ (roadmaps, prune lists) are not plans and stay untouched.

function getPlanProblem(planText: string): string | undefined {
    let plan: any;
    try {
        plan = JSON.parse(planText);
    }
    catch (error) {
        return `The file is not valid JSON: ${(error as Error).message}`;
    }
    const isObject = plan !== null && typeof plan === "object" && !Array.isArray(plan);
    if (!isObject)
        return "The file must be one JSON object with a title and a sections array.";
    if (typeof plan.title !== "string" || plan.title === "")
        return 'The plan needs a "title" string.';
    if (!Array.isArray(plan.sections) || plan.sections.length === 0)
        return 'The plan needs a "sections" array with at least one section.';
    const seenIds = new Set<string>();
    for (const [index, section] of plan.sections.entries()) {
        for (const key of ["id", "intent", "how"]) {
            const value = section?.[key];
            if (typeof value !== "string" || value === "")
                return `Section ${index} needs an "${key}" string.`;
        }
        if (seenIds.has(section.id))
            return `Two sections have the id "${section.id}". Each id must be unique.`;
        seenIds.add(section.id);
    }
    return undefined;
}

function getPlanTextAfterToolCall(toolName: string, toolInput: any): string {
    if (toolName === "Write")
        return toolInput.content;
    const existingText = readFileSync(toolInput.file_path, "utf8");
    if (toolInput.replace_all)
        return existingText.replaceAll(toolInput.old_string, toolInput.new_string);
    return existingText.replace(toolInput.old_string, () => toolInput.new_string);
}

function denyToolCall(reason: string): void {
    console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}

if (import.meta.main) {
    const input = JSON.parse(readFileSync(0, "utf8"));
    const filePath: string = input.tool_input.file_path;
    const isClaudeFolderFile = filePath.startsWith(`${homedir()}/.claude/`);
    const isPlansFolderFile = filePath.split("/").includes("plans");
    if (!isClaudeFolderFile) {
        if (isPlansFolderFile) {
            if (extname(filePath) === ".md") {
                const planName = basename(filePath, ".md");
                denyToolCall(`Write plans as JSON, not Markdown. Write plans/${planName}.plan.json: {"title": "...", "sections": [{"id": "...", "intent": "...", "how": "..."}]}. Then jq can read each section by id.`);
            }
            else if (filePath.endsWith(".plan.json")) {
                const problem = getPlanProblem(getPlanTextAfterToolCall(input.tool_name, input.tool_input));
                if (problem)
                    denyToolCall(`${problem} A plan is {"title": "...", "sections": [{"id": "...", "intent": "...", "how": "..."}]}.`);
            }
        }
    }
}
