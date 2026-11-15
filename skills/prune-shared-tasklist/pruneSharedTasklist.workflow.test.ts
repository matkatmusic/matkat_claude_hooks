#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

interface Proposal {
    id: string;
    verdict: string;
    duplicateOfKeepId?: string;
    reason: string;
    evidence: string;
}

interface CloseResult {
    id: string;
    action: string;
    finalReason: string;
    note?: string;
}

async function runWorkflow(taskIds: string[], proposals: Proposal[], closeResults: CloseResult[]): Promise<{ report: string; results: CloseResult[]; heldOut: { id: string; note: string }[] }> {
    const workflowText = readFileSync(join(import.meta.dirname, "pruneSharedTasklist.workflow.js"), "utf8");
    const workflowBody = workflowText.replace("export const meta", "const meta");
    const closePromptTaskIds: string[] = [];
    async function agent(prompt: string, options: { phase: string }): Promise<unknown> {
        if (options.phase === "Propose")
            return { proposals };
        const taskIdLine = prompt.split("\n")[0];
        const taskId = taskIdLine.slice(taskIdLine.lastIndexOf("TASK_ID: ") + "TASK_ID: ".length);
        closePromptTaskIds.push(taskId);
        for (const closeResult of closeResults) {
            if (closeResult.id === taskId)
                return { proofSource: "stub", evidence: "stub", proposedReasonWasAccurate: true, fileStatusAfter: "completed", ...closeResult };
        }
        throw new Error(`no canned result for task ${taskId}`);
    }
    async function parallel(thunks: (() => Promise<unknown>)[]): Promise<unknown[]> {
        const outputs: unknown[] = [];
        for (const thunk of thunks)
            outputs.push(await thunk());
        return outputs;
    }
    const workflowFunction = new AsyncFunction("args", "agent", "parallel", "phase", "log", workflowBody);
    const args = { taskFolder: "/tasks", memoryFile: "/memory.md", transcriptFolder: "/chats", repoFolders: ["/repo"], closedBy: "task-list pruning 2026-01-02", taskIds };
    const workflowResult = await workflowFunction(args, agent, parallel, () => {}, () => {});
    workflowResult.closePromptTaskIds = closePromptTaskIds;
    return workflowResult;
}

function makeProposal(id: string, verdict: string, duplicateOfKeepId?: string): Proposal {
    return { id, verdict, duplicateOfKeepId, reason: `reason ${id}`, evidence: `evidence ${id}` };
}

const MIXED_PROPOSALS = [makeProposal("11", "ALREADY_DONE"), makeProposal("12", "NOT_NEEDED"), makeProposal("13", "DUPLICATE", "99")];
const MIXED_RESULTS: CloseResult[] = [
    { id: "11", action: "closed", finalReason: "commit abc123 holds the work" },
    { id: "12", action: "left-open", finalReason: "work is not replaced", note: "" },
    { id: "13", action: "failed", finalReason: "", note: "TaskUpdate missing" },
];

test("the report's first line holds the right counts for 1 closed, 1 left-open and 1 failed result", async () => {
    // Setup: 4 pending tasks, 3 proposals, and one result of each kind.
    // Action: run the workflow.
    const workflowResult = await runWorkflow(["11", "12", "13", "14"], MIXED_PROPOSALS, MIXED_RESULTS);
    // Verification: the first line holds every count.
    const firstLine = workflowResult.report.split("\n")[0];
    assert.equal(firstLine, "Pending before: 4. Proposed: 3. Closed: 1. Left open after check: 1. Failed: 1. Held out: 0.");
});

test("a closed task's line holds its id and finalReason", async () => {
    // Setup: the mixed run.
    // Action: run the workflow.
    const workflowResult = await runWorkflow(["11", "12", "13", "14"], MIXED_PROPOSALS, MIXED_RESULTS);
    // Verification: the report holds the closed line, the left-open line and the failed line.
    const lines = workflowResult.report.split("\n");
    assert.equal(lines.includes("#11 closed: commit abc123 holds the work"), true);
    assert.equal(lines.includes("#12 left open: work is not replaced"), true);
    assert.equal(lines.includes("#13 failed: TaskUpdate missing"), true);
});

test("a held-out duplicate is reported as held out and is not sent to the Close phase", async () => {
    // Setup: task 21 is a duplicate of task 22, and both are proposed.
    const proposals = [makeProposal("21", "DUPLICATE", "22"), makeProposal("22", "ALREADY_DONE")];
    const closeResults: CloseResult[] = [{ id: "22", action: "closed", finalReason: "done" }];
    // Action: run the workflow.
    const workflowResult = await runWorkflow(["21", "22"], proposals, closeResults);
    // Verification: task 21 is on a held out line, the count is 1, and only task 22 got a Close agent.
    const lines = workflowResult.report.split("\n");
    assert.equal(lines.some((line) => line.startsWith("#21 held out: ")), true);
    assert.equal(lines[0].endsWith("Held out: 1."), true);
    assert.deepEqual((workflowResult as unknown as { closePromptTaskIds: string[] }).closePromptTaskIds, ["22"]);
});

test("a run with no proposals returns a report whose counts are all zero except pending", async () => {
    // Setup: 3 pending tasks and no proposals.
    // Action: run the workflow.
    const workflowResult = await runWorkflow(["1", "2", "3"], [], []);
    // Verification: the report is one line with zero counts.
    assert.equal(workflowResult.report, "Pending before: 3. Proposed: 0. Closed: 0. Left open after check: 0. Failed: 0. Held out: 0.");
});
