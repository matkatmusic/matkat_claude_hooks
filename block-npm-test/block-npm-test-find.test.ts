#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { findTestRun } from "./block-npm-test-find.ts";

test("findTestRun: suite forms in context", () => {
  assert.deepEqual(findTestRun("cd /x && npm test 2>&1 | tail -50"), { file: undefined, cwd: "/x", env: {} });
  assert.deepEqual(findTestRun("npm run test:unit 2>&1 | tail -60"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("(npm test)"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("node --test *.test.ts"), { file: undefined, cwd: undefined, env: {} });
  assert.deepEqual(findTestRun('node --test "tests/**/*.test.ts"'), { file: undefined, cwd: undefined, env: {} });
});

test("findTestRun: one named file", () => {
  assert.deepEqual(findTestRun("npm test -- tests/a.test.ts"), { file: "tests/a.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("npx jest src/b.spec.js"), { file: "src/b.spec.js", cwd: undefined, env: {} });
  assert.deepEqual(findTestRun('node --test "tests/c.test.ts"'), { file: "tests/c.test.ts", cwd: undefined, env: {} });
  assert.deepEqual(findTestRun("cd /x && bun test tests/r.test.ts 2>&1 | tail -4"), { file: "tests/r.test.ts", cwd: "/x", env: {}, isBunTest: true });
});

test("findTestRun: bun test with a folder keeps the folder as an extra arg", () => {
  assert.deepEqual(findTestRun("bun test demo 2>&1 | tail -5"), { file: undefined, cwd: undefined, env: {}, extraArgs: ["demo"], isBunTest: true });
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
