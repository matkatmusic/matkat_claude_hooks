#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isRunner } from "./block-npm-test-find.ts";
import { splitSimpleCommands } from "./block-npm-test-split.ts";

import { isNodeProject } from "./block-npm-test-scripts.ts";

test("isNodeProject: package.json in cwd", () => {
  const dir = mkdtempSync(`${tmpdir()}/node-project-`);
  writeFileSync(`${dir}/package.json`, "{}");
  assert.equal(isNodeProject(dir), true);
});

test("isNodeProject: package.json in a parent folder", () => {
  const root = mkdtempSync(`${tmpdir()}/node-project-`);
  writeFileSync(`${root}/package.json`, "{}");
  mkdirSync(`${root}/src/deep`, { recursive: true });
  assert.equal(isNodeProject(`${root}/src/deep`), true);
});

test("isNodeProject: no package.json anywhere above (a C++ or PHP tree)", () => {
  const dir = mkdtempSync(`${tmpdir()}/cpp-project-`);
  assert.equal(isNodeProject(dir), false);
});

test("splitSimpleCommands splits at unquoted separators only", () => {
  // The & in 2>&1 splits too; the stray ["1"] segment is harmless for runner detection.
  assert.deepEqual(splitSimpleCommands("cd /x && npm test 2>&1 | tail -50"), [
    ["cd", "/x"],
    ["npm", "test", "2>"],
    ["1"],
    ["tail", "-50"],
  ]);
  assert.deepEqual(splitSimpleCommands('echo "a && npm test" ; ls'), [["echo", "a", "&&", "npm", "test"], ["ls"]]);
  assert.deepEqual(splitSimpleCommands("echo 'x | jest' | cat"), [["echo", "x", "|", "jest"], ["cat"]]);
  assert.deepEqual(splitSimpleCommands("echo a\\;b"), [["echo", "a;b"]]);
  assert.deepEqual(splitSimpleCommands("run $(npm test)"), [["run", "$"], ["npm", "test"]]);
});

test("isRunner: every suite form", () => {
  for (const command of [
    "npm test",
    "npm t",
    "npm run test",
    "npm run test:unit",
    "NODE_ENV=test npm test",
    "yarn test",
    "pnpm test",
    "bun test",
    "node --test",
    "npx jest",
    "jest --coverage",
    "npx vitest run",
    "vitest",
    "mocha",
    "tsx --test",
  ]) {
    assert.equal(isRunner(command.split(" ")), true, command);
  }
});

test("isRunner: not a runner", () => {
  for (const command of ["", "npm run build", "npm tester", "node script.js", "make test", "ctest", "phpunit", "npx tsc"]) {
    assert.equal(isRunner(command.split(" ").filter(Boolean)), false, command);
  }
});

test("isRunner: npm run test:baseline is exempt, it applies the known-failures filter itself", () => {
  assert.equal(isRunner(["npm", "run", "test:baseline"]), false);
  assert.equal(isRunner(["npm", "run", "test:unit"]), true);
});
