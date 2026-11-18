#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
interface FixReport {
    exportedFunctionsToRename: string[];
    notes: string;
}
interface WorkflowArgs {
    logPath: string;
    fixFiles: string[];
    maxHelpers: number;
    eslintProgramPath: string;
    eslintConfigPath: string;
}
interface WorkflowResult {
    reports: { path: string; report: FixReport | null }[];
    exportedFunctionsToRename: string[];
    filesWithoutReport: string[];
}
interface WorkflowRun {
    result: WorkflowResult;
    startedPaths: string[];
    maxInFlight: number;
}
function makeArgs(fixFiles: string[], maxHelpers: number): WorkflowArgs {
    return { logPath: "/log.json", fixFiles, maxHelpers, eslintProgramPath: "/eslint", eslintConfigPath: "/eslint.config.js" };
}
async function runWorkflow(args: WorkflowArgs, reportsByPath: Record<string, FixReport | null>): Promise<WorkflowRun> {
    const workflowText = readFileSync(join(import.meta.dirname, "clearDebtFixFiles.workflow.js"), "utf8");
    const workflowBody = workflowText.replace("export const meta", "const meta");
    const startedPaths: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    async function agent(prompt: string, options: { label: string }): Promise<FixReport | null> {
        const path = options.label.slice("fix:".length);
        startedPaths.push(path);
        inFlight = inFlight + 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight = inFlight - 1;
        return reportsByPath[path];
    }
    async function parallel(thunks: (() => Promise<unknown>)[]): Promise<unknown[]> {
        const promises: Promise<unknown>[] = [];
        for (const thunk of thunks)
            promises.push(thunk());
        return Promise.all(promises);
    }
    const workflowFunction = new AsyncFunction("args", "agent", "parallel", "phase", "log", workflowBody);
    const result = await workflowFunction(args, agent, parallel, () => {}, () => {});
    return { result, startedPaths, maxInFlight };
}
function makeReport(exportedFunctionsToRename: string[]): FixReport {
    return { exportedFunctionsToRename, notes: "done" };
}
const SEVEN_FILES = ["/a1.ts", "/a2.ts", "/a3.ts", "/a4.ts", "/a5.ts", "/a6.ts", "/a7.ts"];
function makeReportsForFiles(files: string[]): Record<string, FixReport | null> {
    const reportsByPath: Record<string, FixReport | null> = {};
    for (const file of files)
        reportsByPath[file] = makeReport([]);
    return reportsByPath;
}
test("one agent runs for each file in fixFiles", async () => {
    // Setup: 7 files and 3 helpers.
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs(SEVEN_FILES, 3), makeReportsForFiles(SEVEN_FILES));
    // Verification: each file got exactly one agent.
    assert.deepEqual([...run.startedPaths].sort(), SEVEN_FILES);
});
test("no more agents run at the same time than maxHelpers, and the pool is used", async () => {
    // Setup: 7 files and 3 helpers.
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs(SEVEN_FILES, 3), makeReportsForFiles(SEVEN_FILES));
    // Verification: 3 agents ran at the same time, never more.
    assert.equal(run.maxInFlight, 3);
});
test("with fewer files than maxHelpers, only one agent per file runs", async () => {
    // Setup: 2 files and 5 helpers.
    // Action: run the workflow.
    const twoFiles = ["/b1.ts", "/b2.ts"];
    const run = await runWorkflow(makeArgs(twoFiles, 5), makeReportsForFiles(twoFiles));
    // Verification: 2 agents ran, each for its own file.
    assert.equal(run.startedPaths.length, 2);
    assert.equal(run.maxInFlight, 2);
});
test("the result lists each file with its report", async () => {
    // Setup: 3 files, each with its own report.
    const files = ["/c1.ts", "/c2.ts", "/c3.ts"];
    const reportsByPath: Record<string, FixReport | null> = { "/c1.ts": makeReport([]), "/c2.ts": makeReport(["getX"]), "/c3.ts": makeReport([]) };
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs(files, 2), reportsByPath);
    // Verification: the result holds one entry for each file with the report of that file.
    assert.equal(run.result.reports.length, 3);
    for (const entry of run.result.reports)
        assert.deepEqual(entry.report, reportsByPath[entry.path]);
});
test("the result lists every exported function that needs a new name", async () => {
    // Setup: 2 files whose reports list 2 and 1 exported functions.
    const files = ["/d1.ts", "/d2.ts"];
    const reportsByPath: Record<string, FixReport | null> = { "/d1.ts": makeReport(["foo", "bar"]), "/d2.ts": makeReport(["baz"]) };
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs(files, 2), reportsByPath);
    // Verification: the 3 names are in the result.
    assert.deepEqual([...run.result.exportedFunctionsToRename].sort(), ["bar", "baz", "foo"]);
});
test("a file whose agent gave no report is listed in filesWithoutReport", async () => {
    // Setup: 2 files; the agent of the second file gives no report.
    const files = ["/e1.ts", "/e2.ts"];
    const reportsByPath: Record<string, FixReport | null> = { "/e1.ts": makeReport([]), "/e2.ts": null };
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs(files, 2), reportsByPath);
    // Verification: only the second file is listed.
    assert.deepEqual(run.result.filesWithoutReport, ["/e2.ts"]);
});
test("an empty fixFiles list starts no agent", async () => {
    // Setup: no files.
    // Action: run the workflow.
    const run = await runWorkflow(makeArgs([], 4), {});
    // Verification: no agent ran and the result lists nothing.
    assert.equal(run.startedPaths.length, 0);
    assert.deepEqual(run.result.reports, []);
});
