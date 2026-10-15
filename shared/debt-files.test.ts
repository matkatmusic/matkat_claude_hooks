#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(`${tmpdir()}/debt-files-home-`);
process.env.HOME = home;
const { findBashWrittenTsPaths, filterUniqueNonTestTsFiles } = await import("./debt-files.ts");

const cwd = mkdtempSync(`${tmpdir()}/debt-files-cwd-`);
writeFileSync(join(cwd, "a.ts"), "");
writeFileSync(join(cwd, "b.ts"), "");
writeFileSync(join(home, "h.ts"), "");

test("findBashWrittenTsPaths returns nothing when the command does not look like a write", () => {
  assert.deepEqual(findBashWrittenTsPaths("cat a.ts", cwd), []);
});

test("findBashWrittenTsPaths returns nothing when a write command names no .ts path", () => {
  assert.deepEqual(findBashWrittenTsPaths("echo hi > out.txt", cwd), []);
});

test("findBashWrittenTsPaths resolves an existing relative .ts path against cwd", () => {
  assert.deepEqual(findBashWrittenTsPaths("echo hi > a.ts", cwd), [join(cwd, "a.ts")]);
});

test("findBashWrittenTsPaths skips a .ts path that does not exist", () => {
  assert.deepEqual(findBashWrittenTsPaths("echo hi > missing.ts", cwd), []);
});

test("findBashWrittenTsPaths returns every existing .ts path in order", () => {
  assert.deepEqual(findBashWrittenTsPaths("cp a.ts b.ts", cwd), [join(cwd, "a.ts"), join(cwd, "b.ts")]);
});

test("findBashWrittenTsPaths expands a leading tilde to HOME", () => {
  assert.deepEqual(findBashWrittenTsPaths("cp a.ts ~/h.ts", cwd), [join(cwd, "a.ts"), join(home, "h.ts")]);
});

test("findBashWrittenTsPaths expands a leading $HOME to HOME", () => {
  assert.deepEqual(findBashWrittenTsPaths("mv a.ts $HOME/h.ts", cwd), [join(cwd, "a.ts"), join(home, "h.ts")]);
});

test("findBashWrittenTsPaths keeps an absolute path as given", () => {
  assert.deepEqual(findBashWrittenTsPaths(`echo hi > ${join(cwd, "a.ts")}`, "/"), [join(cwd, "a.ts")]);
});

test("filterUniqueNonTestTsFiles keeps .ts files and drops duplicates in first-seen order", () => {
  assert.deepEqual(filterUniqueNonTestTsFiles(["/x/b.ts", "/x/a.ts", "/x/b.ts"]), ["/x/b.ts", "/x/a.ts"]);
});

test("filterUniqueNonTestTsFiles drops .test.ts files", () => {
  assert.deepEqual(filterUniqueNonTestTsFiles(["/x/a.test.ts", "/x/a.ts"]), ["/x/a.ts"]);
});

test("filterUniqueNonTestTsFiles drops files that are not .ts", () => {
  assert.deepEqual(filterUniqueNonTestTsFiles(["/x/a.js", "/x/a.tsx", "/x/a.ts"]), ["/x/a.ts"]);
});

test("filterUniqueNonTestTsFiles returns an empty list for an empty list", () => {
  assert.deepEqual(filterUniqueNonTestTsFiles([]), []);
});
