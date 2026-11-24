#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSkillBody, computeHelperLineRanges } from "./SkillBodyEmitter.ts";

function makeProjectFolderWithLog(logText: string | undefined): string {
    const projectFolder = mkdtempSync(join(tmpdir(), "prune-papercuts-"));
    if (logText === undefined)
        return projectFolder;
    mkdirSync(join(projectFolder, ".claude"));
    writeFileSync(join(projectFolder, ".claude", "papercuts.md"), logText);
    return projectFolder;
}

function buildThrowsWhenLogIsMissing() {
    const projectFolder = makeProjectFolderWithLog(undefined);
    assert.throws(() => buildSkillBody(projectFolder, "2026-11-24"), /papercuts\.md/);
}

function buildFillsInProjectFolderAndLogPath() {
    const projectFolder = makeProjectFolderWithLog("a\nb\nc\n");
    const body = buildSkillBody(projectFolder, "2026-11-24");
    assert.ok(body.includes(join(projectFolder, ".claude", "papercuts.md")));
    assert.ok(!body.includes("<PROJECT>"));
}

function buildFillsInPruneFilePathWithDate() {
    const projectFolder = makeProjectFolderWithLog("a\n");
    const body = buildSkillBody(projectFolder, "2026-11-24");
    assert.ok(body.includes(join(projectFolder, "plans", "2026-11-24-papercuts-prune.json")));
}

function buildFillsInLineCountOfLog() {
    const projectFolder = makeProjectFolderWithLog("a\nb\nc\n");
    const body = buildSkillBody(projectFolder, "2026-11-24");
    assert.ok(body.includes("3 lines"));
}

function rangesCoverEveryLineOnceInOrder() {
    const ranges = computeHelperLineRanges(100);
    assert.equal(ranges[0][0], 1);
    assert.equal(ranges[ranges.length - 1][1], 100);
    for (let index = 1; index < ranges.length; index++)
        assert.equal(ranges[index][0], ranges[index - 1][1] + 1);
}

function rangesUseOneHelperForAShortLog() {
    assert.deepEqual(computeHelperLineRanges(7), [[1, 7]]);
}

function rangesUseAtMostSixHelpers() {
    const ranges = computeHelperLineRanges(400);
    assert.equal(ranges.length, 6);
    assert.equal(ranges[5][1], 400);
}

function rangesThrowForAnEmptyLog() {
    assert.throws(() => computeHelperLineRanges(0), /empty/);
}

function buildPrintsOneRangeForEachHelper() {
    const projectFolder = makeProjectFolderWithLog("a\nb\nc\n");
    const body = buildSkillBody(projectFolder, "2026-11-24");
    assert.ok(body.includes("lines 1 to 3"));
}

function buildWritesPruneFileWithOnlyTheEndRecord() {
    const projectFolder = makeProjectFolderWithLog("a\n");
    buildSkillBody(projectFolder, "2026-11-24");
    const pruneFileText = readFileSync(join(projectFolder, "plans", "2026-11-24-papercuts-prune.json"), "utf8");
    assert.deepEqual(JSON.parse(pruneFileText), [{ end: true }]);
}

function buildPrintsValidateCommandForPruneFile() {
    const projectFolder = makeProjectFolderWithLog("a\n");
    const body = buildSkillBody(projectFolder, "2026-11-24");
    assert.ok(body.includes(`jq -e`));
    assert.ok(body.includes(`jq -e '[.[] | select(.line != null) | .line] | length == (unique | length)' "${join(projectFolder, "plans", "2026-11-24-papercuts-prune.json")}"`));
}

test("computeHelperLineRanges covers every line once in order", rangesCoverEveryLineOnceInOrder);
test("computeHelperLineRanges uses one helper for a short log", rangesUseOneHelperForAShortLog);
test("computeHelperLineRanges uses at most six helpers", rangesUseAtMostSixHelpers);
test("computeHelperLineRanges throws for an empty log", rangesThrowForAnEmptyLog);
test("buildSkillBody prints one range for each helper", buildPrintsOneRangeForEachHelper);
test("buildSkillBody writes the prune file with only the end record", buildWritesPruneFileWithOnlyTheEndRecord);
test("buildSkillBody prints the validate command for the prune file", buildPrintsValidateCommandForPruneFile);
test("buildSkillBody throws when the log is missing", buildThrowsWhenLogIsMissing);
test("buildSkillBody fills in the project folder and the log path", buildFillsInProjectFolderAndLogPath);
test("buildSkillBody fills in the prune file path with the date", buildFillsInPruneFilePathWithDate);
test("buildSkillBody fills in the line count of the log", buildFillsInLineCountOfLog);
