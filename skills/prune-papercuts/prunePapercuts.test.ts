import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRemovalRecords, removeLeadingDash, removeMarkedLinesFromFile, validateRemovalRecordMatchesLine } from "./prunePapercuts.ts";

interface TempFiles {
    pruneJsonPath: string;
    papercutsPath: string;
}

function createTempFiles(papercutsLines: string[], pruneElements: object[]): TempFiles {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), "prune-papercuts-")));
    const pruneJsonPath = join(folder, "prune.json");
    const papercutsPath = join(folder, "papercuts.md");
    writeFileSync(pruneJsonPath, JSON.stringify(pruneElements));
    writeFileSync(papercutsPath, papercutsLines.join("\n") + "\n");
    return { pruneJsonPath, papercutsPath };
}

function test_removeMarkedLinesDeletesOnlyTheMarkedLines() {
    // Scenario: two of four lines are marked; only those two leave the file.
    // Step: make a papercuts file with four lines and a prune file that marks lines 2 and 4.
    const { pruneJsonPath, papercutsPath } = createTempFiles(
        ["- keep one", "- drop two", "- keep three", "- drop four"],
        [
            { line: 2, textStart: "- drop two", reason: "gone", proof: "x" },
            { line: 4, textStart: "- drop four", reason: "gone", proof: "x" },
        ],
    );
    // Step: run the script function.
    removeMarkedLinesFromFile(pruneJsonPath, papercutsPath);
    // Step: the file holds only the two unmarked lines.
    assert.equal(readFileSync(papercutsPath, "utf8"), "- keep one\n- keep three\n");
}

function test_matchWhenOnlyOneSideHasLeadingDash() {
    // Scenario: the record has no "- " but the file line has one, and the other way around.
    // Step: check a record without the dash against a line with the dash.
    const withoutDash = { line: 1, textStart: "alpha", reason: "gone", proof: "x" };
    validateRemovalRecordMatchesLine(withoutDash, ["- alpha beta"]);
    // Step: check a record with the dash against a line without the dash.
    const withDash = { line: 1, textStart: "- alpha", reason: "gone", proof: "x" };
    validateRemovalRecordMatchesLine(withDash, ["alpha beta"]);
    // Step: the helper removes exactly one leading dash.
    assert.equal(removeLeadingDash("- - alpha"), "- alpha");
}

function test_assertThrowsOnStartTextMismatchAndLeavesFileUnchanged() {
    // Scenario: one record matches and one record does not match.
    // Step: make the files.
    const originalLines = ["- keep one", "- drop two", "- keep three"];
    const { pruneJsonPath, papercutsPath } = createTempFiles(
        originalLines,
        [
            { line: 2, textStart: "- drop two", reason: "gone", proof: "x" },
            { line: 3, textStart: "- different words", reason: "gone", proof: "x" },
        ],
    );
    // Step: the run throws and the message names line 3.
    assert.throws(removeMarkedLinesFromFile.bind(null, pruneJsonPath, papercutsPath), /line 3/);
    // Step: the file is unchanged.
    assert.equal(readFileSync(papercutsPath, "utf8"), originalLines.join("\n") + "\n");
}

function test_assertThrowsOnLineNumberPastTheEnd() {
    // Scenario: a record points at line 5 of a two-line file.
    // Step: make the files.
    const { pruneJsonPath, papercutsPath } = createTempFiles(
        ["- one", "- two"],
        [{ line: 5, textStart: "- one", reason: "gone", proof: "x" }],
    );
    // Step: the run throws and the message names line 5.
    assert.throws(removeMarkedLinesFromFile.bind(null, pruneJsonPath, papercutsPath), /line 5/);
    // Step: the file is unchanged.
    assert.equal(readFileSync(papercutsPath, "utf8"), "- one\n- two\n");
}

function test_assertThrowsOnDuplicateLineNumber() {
    // Scenario: two records share line 2.
    // Step: make the files.
    const { pruneJsonPath, papercutsPath } = createTempFiles(
        ["- one", "- two", "- three"],
        [
            { line: 2, textStart: "- two", reason: "gone", proof: "x" },
            { line: 2, textStart: "- two", reason: "replaced", proof: "y" },
        ],
    );
    // Step: the run throws and the message names line 2.
    assert.throws(removeMarkedLinesFromFile.bind(null, pruneJsonPath, papercutsPath), /line 2/);
    // Step: the file is unchanged.
    assert.equal(readFileSync(papercutsPath, "utf8"), "- one\n- two\n- three\n");
}

function test_readRemovalRecordsSkipsEndMarker() {
    // Scenario: the prune file ends with {"end": true}.
    // Step: make a prune file with one record and the end marker.
    const { pruneJsonPath } = createTempFiles(
        ["- one"],
        [{ line: 1, textStart: "- one", reason: "gone", proof: "x" }, { end: true }],
    );
    // Step: read the records.
    const records = readRemovalRecords(pruneJsonPath);
    // Step: only the record with a line number comes back.
    assert.equal(records.length, 1);
    assert.equal(records[0].line, 1);
}

test("removes only the marked lines", test_removeMarkedLinesDeletesOnlyTheMarkedLines);
test("matches when only one side has the leading dash", test_matchWhenOnlyOneSideHasLeadingDash);
test("throws on start-text mismatch and leaves the file unchanged", test_assertThrowsOnStartTextMismatchAndLeavesFileUnchanged);
test("throws on a line number past the end", test_assertThrowsOnLineNumberPastTheEnd);
test("throws on a duplicate line number", test_assertThrowsOnDuplicateLineNumber);
test("skips the end marker", test_readRemovalRecordsSkipsEndMarker);
