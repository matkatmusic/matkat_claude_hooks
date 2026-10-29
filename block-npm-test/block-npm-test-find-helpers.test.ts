#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { splitSimpleCommands } from "./block-npm-test-split.ts";
import { buildTestRun } from "./block-npm-test-find-helpers.ts";

function buildRunAt(command: string, index: number) {
  return buildTestRun(splitSimpleCommands(command), index);
}

test("buildTestRun: one named file", () => {
  assert.deepEqual(buildRunAt("npm test -- tests/a.test.ts", 0), { file: "tests/a.test.ts", cwd: undefined, env: {}, runnerWords: ["npm", "test", "--", "tests/a.test.ts"] });
  assert.deepEqual(buildRunAt("npx jest src/b.spec.js", 0), { file: "src/b.spec.js", cwd: undefined, env: {}, runnerWords: ["npx", "jest", "src/b.spec.js"] });
  assert.deepEqual(buildRunAt('node --test "tests/c.test.ts"', 0), { file: "tests/c.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(buildRunAt("cd /x && bun test tests/r.test.ts 2>&1 | tail -4", 1), { file: "tests/r.test.ts", cwd: "/x", env: {}, isBunTest: true });
});

test("buildTestRun: a named file keeps the runner Claude typed, without shell redirects", () => {
  assert.deepEqual(buildRunAt("jest math.test.ts 2>&1 | tail -5", 0).runnerWords, ["jest", "math.test.ts"]);
  assert.deepEqual(buildRunAt("CI=1 vitest run src/x.spec.ts", 0).runnerWords, ["vitest", "run", "src/x.spec.ts"]);
  assert.equal(buildRunAt("node --test a.test.ts", 0).runnerWords, undefined, "node --test is run by the hook itself");
});

test("buildTestRun: bun test with a folder keeps the folder as an extra arg", () => {
  assert.deepEqual(buildRunAt("bun test demo 2>&1 | tail -5", 0), { file: undefined, cwd: undefined, env: {}, extraArgs: ["demo"], isBunTest: true });
});

test("buildTestRun: node --test with two named files keeps both files", () => {
  const run = buildRunAt("node --test a.test.ts b.test.ts", 0);
  const keptWords = [run.file, ...(run.extraArgs ?? [])];
  assert.ok(keptWords.includes("a.test.ts"), "a.test.ts is kept");
  assert.ok(keptWords.includes("b.test.ts"), "b.test.ts is kept");
});

test("buildTestRun: bun test with two named files keeps both files", () => {
  const run = buildRunAt("bun test a.test.ts b.test.ts", 0);
  const keptWords = [run.file, ...(run.extraArgs ?? [])];
  assert.ok(keptWords.includes("a.test.ts"), "a.test.ts is kept");
  assert.ok(keptWords.includes("b.test.ts"), "b.test.ts is kept");
});

test("buildTestRun: shell redirects are not extra args", () => {
  assert.deepEqual(buildRunAt("node --test tests/index.html.test.ts 2>&1 | tail", 0), { file: "tests/index.html.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(buildRunAt("node --test --watch a.test.ts 2> /dev/null", 0), { file: "a.test.ts", cwd: undefined, env: {}, extraArgs: ["--watch"] });
});

test("buildTestRun: node --test's own flags are captured as extraArgs so a single test can be scoped", () => {
  assert.deepEqual(buildRunAt("node --test --test-name-pattern=my-test tests/a.test.ts", 0), {
    file: "tests/a.test.ts",
    cwd: undefined,
    env: {},
    extraArgs: ["--test-name-pattern=my-test"],
  });
  assert.deepEqual(buildRunAt("tsx --test tests/a.test.ts --test-only", 0), {
    file: "tests/a.test.ts",
    cwd: undefined,
    env: {},
    extraArgs: ["--test-only"],
  });
  assert.deepEqual(buildRunAt("node --test *.test.ts", 0), { file: undefined, cwd: undefined, env: {} }, "a glob is not a runner flag");
});

test("buildTestRun: leading VAR=value words before the runner are captured as env", () => {
  assert.deepEqual(buildRunAt("cd /x\nSERVER_PORT=3020 CDP_PORT=9353 npm run test 2>&1 | tail -60", 1), {
    file: undefined,
    cwd: "/x",
    env: { SERVER_PORT: "3020", CDP_PORT: "9353" },
  });
});

test("buildTestRun: a cd before the runner sets the run directory", () => {
  assert.deepEqual(buildRunAt("cd -- /w/task-1 && node --test /w/task-1/tests/a.test.ts", 1), {
    file: "/w/task-1/tests/a.test.ts",
    cwd: "/w/task-1",
    env: {},
  });
  assert.deepEqual(buildRunAt("(cd -- '/w/task-1' && node --test /w/task-1/tests/a.test.ts)", 1), {
    file: "/w/task-1/tests/a.test.ts",
    cwd: "/w/task-1",
    env: {},
  });
  assert.deepEqual(buildRunAt("cd /w/task-1; npm test", 1), { file: undefined, cwd: "/w/task-1", env: {} });
  assert.deepEqual(buildRunAt("npm test; cd /elsewhere", 0), { file: undefined, cwd: undefined, env: {} }, "a cd after the runner is ignored");
  assert.deepEqual(buildRunAt("cd && npm test", 1), { file: undefined, cwd: undefined, env: {} }, "bare cd has no target");
  assert.deepEqual(buildRunAt("cd /a && mkdir -p b && cd b && npm test", 3), { file: undefined, cwd: "/a/b", env: {} }, "cds chain in order");
  assert.deepEqual(buildRunAt("cd a && cd /b && npm test", 2), { file: undefined, cwd: "/b", env: {} }, "an absolute cd resets the chain");
  assert.deepEqual(buildRunAt("cd ~/x && npm test", 1), { file: undefined, cwd: `${homedir()}/x`, env: {} }, "~ expands to the home folder");
  assert.deepEqual(buildRunAt("cd ~ && npm test", 1), { file: undefined, cwd: homedir(), env: {} }, "bare ~ is the home folder");
});
