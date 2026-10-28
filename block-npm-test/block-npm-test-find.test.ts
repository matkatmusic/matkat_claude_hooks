#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { findTestRun, findTestRuns } from "./block-npm-test-find.ts";

test("findTestRun: suite forms in context", () => {
  assert.deepEqual(findTestRun("cd /x && npm test 2>&1 | tail -50"), { file: undefined, cwd: "/x", env: {} });
  assert.deepEqual(findTestRun("npm run test:unit 2>&1 | tail -60"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("(npm test)"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("node --test *.test.ts"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun('node --test "tests/**/*.test.ts"'), { file: undefined, cwd: undefined, env: {} });
});

test("findTestRun: one named file", () => {
  assert.deepEqual(findTestRun("npm test -- tests/a.test.ts"), { file: "tests/a.test.ts", cwd: undefined, env: {}, runnerWords: ["npm", "test", "--", "tests/a.test.ts"] });
  assert.deepEqual(findTestRun("npx jest src/b.spec.js"), { file: "src/b.spec.js", cwd: undefined, env: {}, runnerWords: ["npx", "jest", "src/b.spec.js"] });
  assert.deepEqual(findTestRun('node --test "tests/c.test.ts"'), { file: "tests/c.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("cd /x && bun test tests/r.test.ts 2>&1 | tail -4"), { file: "tests/r.test.ts", cwd: "/x", env: {}, isBunTest: true });
});

test("findTestRun: a named file keeps the runner Claude typed, without shell redirects", () => {
  assert.deepEqual(findTestRun("jest math.test.ts 2>&1 | tail -5")?.runnerWords, ["jest", "math.test.ts"]);
  assert.deepEqual(findTestRun("CI=1 vitest run src/x.spec.ts")?.runnerWords, ["vitest", "run", "src/x.spec.ts"]);
  assert.equal(findTestRun("node --test a.test.ts")?.runnerWords, undefined, "node --test is run by the hook itself");
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

test("findTestRun: bun test with a folder keeps the folder as an extra arg", () => {
  assert.deepEqual(findTestRun("bun test demo 2>&1 | tail -5"), { file: undefined, cwd: undefined, env: {}, extraArgs: ["demo"], isBunTest: true });
});

test("findTestRuns: node --test with two named files keeps both files", () => {
  const run = findTestRuns("node --test a.test.ts b.test.ts")[0];
  const keptWords = [run.file, ...(run.extraArgs ?? [])];
  assert.ok(keptWords.includes("a.test.ts"), "a.test.ts is kept");
  assert.ok(keptWords.includes("b.test.ts"), "b.test.ts is kept");
});

test("findTestRuns: bun test with two named files keeps both files", () => {
  const run = findTestRuns("bun test a.test.ts b.test.ts")[0];
  const keptWords = [run.file, ...(run.extraArgs ?? [])];
  assert.ok(keptWords.includes("a.test.ts"), "a.test.ts is kept");
  assert.ok(keptWords.includes("b.test.ts"), "b.test.ts is kept");
});

test("findTestRun: shell redirects are not extra args", () => {
  assert.deepEqual(findTestRun("node --test tests/index.html.test.ts 2>&1 | tail"), { file: "tests/index.html.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("node --test --watch a.test.ts 2> /dev/null"), { file: "a.test.ts", cwd: undefined, env: {}, extraArgs: ["--watch"] });
});

test("findTestRun: node --test's own flags are captured as extraArgs so a single test can be scoped", () => {
  assert.deepEqual(findTestRun("node --test --test-name-pattern=my-test tests/a.test.ts"), {
    file: "tests/a.test.ts",
    cwd: undefined,
    env: {},
    extraArgs: ["--test-name-pattern=my-test"],
  });
  assert.deepEqual(findTestRun("tsx --test tests/a.test.ts --test-only"), {
    file: "tests/a.test.ts",
    cwd: undefined,
    env: {},
    extraArgs: ["--test-only"],
  });
  assert.deepEqual(findTestRun("node --test *.test.ts"), { file: undefined, cwd: undefined, env: {} }, "a glob is not a runner flag");
});

test("findTestRun: leading VAR=value words before the runner are captured as env", () => {
  assert.deepEqual(findTestRun("cd /x\nSERVER_PORT=3020 CDP_PORT=9353 npm run test 2>&1 | tail -60"), {
    file: undefined,
    cwd: "/x",
    env: { SERVER_PORT: "3020", CDP_PORT: "9353" },
  });
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

test("findTestRun: a cd before the runner sets the run directory", () => {
  assert.deepEqual(findTestRun("cd -- /w/task-1 && node --test /w/task-1/tests/a.test.ts"), {
    file: "/w/task-1/tests/a.test.ts",
    cwd: "/w/task-1",
    env: {},
  });
  assert.deepEqual(findTestRun("(cd -- '/w/task-1' && node --test /w/task-1/tests/a.test.ts)"), {
    file: "/w/task-1/tests/a.test.ts",
    cwd: "/w/task-1",
    env: {},
  });
  assert.deepEqual(findTestRun("cd /w/task-1; npm test"), { file: undefined, cwd: "/w/task-1", env: {} });
  assert.deepEqual(findTestRun("npm test; cd /elsewhere"), { file: undefined, cwd: undefined, env: {} }, "a cd after the runner is ignored");
  assert.deepEqual(findTestRun("cd && npm test"), { file: undefined, cwd: undefined, env: {} }, "bare cd has no target");
  assert.deepEqual(findTestRun("cd /a && mkdir -p b && cd b && npm test"), { file: undefined, cwd: "/a/b", env: {} }, "cds chain in order");
  assert.deepEqual(findTestRun("cd a && cd /b && npm test"), { file: undefined, cwd: "/b", env: {} }, "an absolute cd resets the chain");
  assert.deepEqual(findTestRun("cd ~/x && npm test"), { file: undefined, cwd: `${homedir()}/x`, env: {} }, "~ expands to the home folder");
  assert.deepEqual(findTestRun("cd ~ && npm test"), { file: undefined, cwd: homedir(), env: {} }, "bare ~ is the home folder");
});
