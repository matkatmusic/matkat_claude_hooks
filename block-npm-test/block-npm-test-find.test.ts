#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { findTestRun, findTestRuns } from "./block-npm-test-find.ts";

test("findTestRun: suite forms in context", () => {
  assert.deepEqual(findTestRun("cd /x && npm test 2>&1 | tail -50"), { file: undefined, cwd: "/x", env: {} });
  assert.deepEqual(findTestRun("npm run test:unit 2>&1 | tail -60"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("(npm test)"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("node --test *.test.ts"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun('node --test "tests/**/*.test.ts"'), { file: undefined, cwd: undefined, env: {} });
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
  assert.deepEqual(findTestRun("cat <<EOF\nhello\nEOF\nnpm test"), { file: undefined, cwd: undefined, env: {} }, "runner after the heredoc still counts");
  assert.deepEqual(findTestRun("npm test <<EOF\nignored\nEOF"), { file: undefined, cwd: undefined, env: {} }, "runner before the heredoc still counts");
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
