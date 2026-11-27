import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

function buildTrailer(): string {
    return "Co-Authored-By: Claude Sonnet <noreply@anthropic.com>";
}

function executeHook(command: string) {
    const input = JSON.stringify({ cwd: "/work/myRepo", tool_input: { command, description: "make a commit" } });
    const hookFile = `${import.meta.dirname}/removeCoAuthorLine.ts`;
    const hook = spawnSync("bun", [hookFile], { input, encoding: "utf8" });
    assert.equal(hook.status, 0, hook.stderr);
    const hasOutput = hook.stdout.trim() !== "";
    if (hasOutput)
        return JSON.parse(hook.stdout).hookSpecificOutput;
    return undefined;
}

// function assertCommandChange(command: string, expectedCommand: string): void {
//     const output = executeHook(command);
//     assert.equal(output.permissionDecision, "allow");
//     assert.equal(output.updatedInput.command, expectedCommand);
//     assert.equal(output.updatedInput.description, "make a commit");
//     const syntaxCheck = spawnSync("bash", ["-n", "-c", output.updatedInput.command], { encoding: "utf8" });
//     assert.equal(syntaxCheck.status, 0, syntaxCheck.stderr);
// }

function assertDeny(command: string): void {
    const output = executeHook(command);
    assert.equal(output?.permissionDecision, "deny");
    assert.equal(output.permissionDecisionReason, "Remove the Co-Authored-By line from the commit message, then commit again.");
    assert.equal(output.updatedInput, undefined);
}

function test_denyLineWithClosingQuote(): void {
    assertDeny(`git commit -m "Fix bug\n\n${buildTrailer()}"`);
}

function test_denyHeredocLine(): void {
    assertDeny(`git commit -m "$(cat <<'EOF'\nFix bug\n\n${buildTrailer()}\nClaude-Session: x\nEOF\n)"`);
}

function test_denyLineInAnyLetterCaseWithNoEmail(): void {
    assertDeny(`git commit -m 'Fix bug\nco-authored-by: Claude'`);
}

function test_denySecondMessageFlag(): void {
    assertDeny(`git commit -m "fix" -m "${buildTrailer()}" && git log -1`);
}

function test_denyLineWhenGitRunsInAnotherFolder(): void {
    assertDeny(`cd x && git -C /other/repo commit -m "fix\n${buildTrailer()}"`);
}

function test_denyTrailerFlagWithNoQuotes(): void {
    assertDeny(`git commit -m "fix" --trailer=Co-Authored-By:Claude`);
}

function test_isSilentForCommitWithNoLine(): void {
    assert.equal(executeHook(`git commit -m "Fix bug"`), undefined);
}

// function test_isSilentForNameInsideSentence(): void {
//     assert.equal(executeHook(`git commit -m "Remove Co-Authored-By: lines"`), undefined);
// }

function test_denyNameInsideSentence(): void {
    assertDeny(`git commit -m "Remove Co-Authored-By: lines"`);
}

function test_isSilentForOtherCommand(): void {
    assert.equal(executeHook(`echo "${buildTrailer()}"`), undefined);
}

test("denies a -m message with the line and the closing quote on that line", test_denyLineWithClosingQuote);
test("denies a heredoc message with the line", test_denyHeredocLine);
test("denies the line in any letter case, with no email", test_denyLineInAnyLetterCaseWithNoEmail);
test("denies the line in a second -m flag", test_denySecondMessageFlag);
test("denies the line when git runs with -C after cd", test_denyLineWhenGitRunsInAnotherFolder);
test("denies the line in a --trailer flag with no quotes", test_denyTrailerFlagWithNoQuotes);
test("gives no output for a git commit with no such line", test_isSilentForCommitWithNoLine);
// test("gives no output for a git commit that only names Co-Authored-By: inside a sentence", test_isSilentForNameInsideSentence);
test("denies a git commit that names Co-Authored-By: inside a sentence", test_denyNameInsideSentence);
test("gives no output for a command that is not git commit", test_isSilentForOtherCommand);
