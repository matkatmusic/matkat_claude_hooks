#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { findTestRun, findTestRuns } from "./blockNpmTestFind.ts";

// The typed words are checked in blockNpmTestFindHelpers.test.ts; these tests compare the rest of the run.
function findRunWithoutWords(command: string) {
  const run = findTestRun(command);
  if (run === undefined)
    return undefined;
  const { runnerWords, ...runWithoutWords } = run;
  return runWithoutWords;
}

test("findTestRun: suite forms in context", () => {
  assert.deepEqual(findRunWithoutWords("cd /x && npm test 2>&1 | tail -50"), { file: undefined, cwd: "/x", env: {} });
  assert.deepEqual(findRunWithoutWords("npm run test:unit 2>&1 | tail -60"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findRunWithoutWords("(npm test)"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findRunWithoutWords("node --test *.test.ts"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findRunWithoutWords('node --test "tests/**/*.test.ts"'), { file: undefined, cwd: undefined, env: {} });
});

test("test_findTestRun_blocks_node_with_import_flags_before_test_flag", () => {
  // Scenario: node has its own flags (--import tsx) before --test, with a glob and a piped filter.
  // Steps:
  // the command is the one the user reported as not blocked.
  const command = 'cd "/Users/x/jfred" && node --import tsx --test tests/engineV3_tui_*.test.ts tests/jfredTUI.test.ts 2>&1 | rg -n "^# (tests|pass|fail)|^not ok" | head -20';
  // the hook must find one test run, with the cd folder.
  const run = findTestRun(command);
  assert.notEqual(run, undefined);
  assert.equal(run?.cwd, "/Users/x/jfred");
  // a node command that has no --test flag must still be ignored.
  assert.equal(findTestRun("node --import tsx script.ts"), undefined);
});

test("test_findTestRun_keeps_quoted_cd_folder_with_spaces_in_one_piece", () => {
  // Scenario: the cd folder is quoted and has spaces in its name.
  // Steps:
  // the command cds into a quoted folder with spaces, then runs a node test.
  const command = 'cd "/Users/x/claude code src/RevEng/jfred" && node --import tsx --test tests/engineV3_tui_*.test.ts tests/jfredTUI.test.ts';
  const run = findTestRun(command);
  // the cwd must be the whole folder, not only its last piece.
  assert.equal(run?.cwd, "/Users/x/claude code src/RevEng/jfred");
  // the test file after the cd must stay in the typed command.
  assert.equal(run?.file, "tests/jfredTUI.test.ts");
});

test("findTestRuns: every test command in the line counts, each with its own cd folder", () => {
  const runs = findTestRuns("cd /a && npm test; cd /b && npm run test:e2e");
  assert.equal(runs.length, 2);
  assert.equal(runs[0].cwd, "/a");
  assert.equal(runs[1].cwd, "/b");
  const mixedRuns = findTestRuns("npm test && jest a.test.ts");
  assert.equal(mixedRuns[0].file, undefined);
  assert.equal(mixedRuns[1].file, "a.test.ts");
});

test("findTestRuns: a test command inside bash -c quotes counts", () => {
  assert.equal(findTestRuns('bash -c "npm test"').length, 1);
  assert.equal(findTestRuns("sh -c 'cd /x && npm test'")[0].cwd, "/x");
  assert.equal(findTestRuns("bash -lc 'jest a.test.ts'")[0].file, "a.test.ts");
  assert.equal(findTestRuns('bash -c "echo hi"').length, 0);
  assert.equal(findTestRuns("bash script.sh").length, 0);
});

test("heredoc bodies are skipped", () => {
  assert.equal(findTestRun("cat <<EOF > notes.md\nnpm test\nEOF"), undefined, "bare tag");
  assert.equal(findTestRun("cat <<'EOF'\nnpx jest\nEOF"), undefined, "quoted tag");
  assert.equal(findTestRun('cat <<"EOF"\nvitest\nEOF'), undefined, "double quoted tag");
  assert.equal(findTestRun("cat <<-EOF\n\tnpm test\n\tEOF"), undefined, "dash tag with tabs");
  assert.deepEqual(findRunWithoutWords("cat <<EOF\nhello\nEOF\nnpm test"), { file: undefined, cwd: undefined, env: {} }, "runner after the heredoc still counts");
  assert.deepEqual(findRunWithoutWords("npm test <<EOF\nignored\nEOF"), { file: undefined, cwd: undefined, env: {} }, "runner before the heredoc still counts");
});

test("findTestRun: quoted runner text is not a run", () => {
  for (const command of [
    'echo "{\\"command\\":\\"npm test\\"}" | node hook.ts',
    'node -e \'console.log("| npx tsc -p . && node --test x")\'',
    "echo 'npm test; jest' > notes.txt",
    "cat a.test.ts; npm run build",
  ]) {
    assert.equal(findTestRun(command), undefined, command);
  }
});
