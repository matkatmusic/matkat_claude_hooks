#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(`${tmpdir()}/debt-files-home-`);
process.env.HOME = home;
const { findBashWrittenDebtCheckedPaths, filterUniqueDebtCheckedFiles } = await import("./debt-files.ts");

const cwd = mkdtempSync(`${tmpdir()}/debt-files-cwd-`);
writeFileSync(join(cwd, "a.css"), "");
writeFileSync(join(cwd, "a.html"), "");
writeFileSync(join(cwd, "a.ts"), "");
writeFileSync(join(cwd, "b.ts"), "");
writeFileSync(join(home, "h.ts"), "");

test("findBashWrittenDebtCheckedPaths returns nothing when the command does not look like a write", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("cat a.ts", cwd), []);
});

test("findBashWrittenDebtCheckedPaths returns nothing when a write command names no checked path", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("echo hi > out.txt", cwd), []);
});

test("findBashWrittenDebtCheckedPaths resolves an existing relative .ts path against cwd", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("echo hi > a.ts", cwd), [join(cwd, "a.ts")]);
});

test("findBashWrittenDebtCheckedPaths returns an existing .css path named in a write command", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("echo hi > a.css", cwd), [join(cwd, "a.css")]);
});

test("findBashWrittenDebtCheckedPaths returns an existing .html path named in a write command", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("echo hi > a.html", cwd), [join(cwd, "a.html")]);
});

test("findBashWrittenDebtCheckedPaths skips a .ts path that does not exist", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("echo hi > missing.ts", cwd), []);
});

test("findBashWrittenDebtCheckedPaths returns every existing .ts path in order", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("cp a.ts b.ts", cwd), [join(cwd, "a.ts"), join(cwd, "b.ts")]);
});

test("findBashWrittenDebtCheckedPaths expands a leading tilde to HOME", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("cp a.ts ~/h.ts", cwd), [join(cwd, "a.ts"), join(home, "h.ts")]);
});

test("findBashWrittenDebtCheckedPaths expands a leading $HOME to HOME", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths("mv a.ts $HOME/h.ts", cwd), [join(cwd, "a.ts"), join(home, "h.ts")]);
});

test("findBashWrittenDebtCheckedPaths keeps an absolute path as given", () => {
  assert.deepEqual(findBashWrittenDebtCheckedPaths(`echo hi > ${join(cwd, "a.ts")}`, "/"), [join(cwd, "a.ts")]);
});

test("filterUniqueDebtCheckedFiles keeps .ts files and drops duplicates in first-seen order", () => {
  assert.deepEqual(filterUniqueDebtCheckedFiles(["/x/b.ts", "/x/a.ts", "/x/b.ts"]), ["/x/b.ts", "/x/a.ts"]);
});

test("filterUniqueDebtCheckedFiles keeps .html and .css files", () => {
  assert.deepEqual(filterUniqueDebtCheckedFiles(["/x/a.html", "/x/a.css"]), ["/x/a.html", "/x/a.css"]);
});

test("filterUniqueDebtCheckedFiles drops .test.ts files", () => {
  assert.deepEqual(filterUniqueDebtCheckedFiles(["/x/a.test.ts", "/x/a.ts"]), ["/x/a.ts"]);
});

test("filterUniqueDebtCheckedFiles drops files that are not .ts, .html or .css", () => {
  assert.deepEqual(filterUniqueDebtCheckedFiles(["/x/a.js", "/x/a.tsx", "/x/a.md", "/x/a.ts"]), ["/x/a.ts"]);
});

test("filterUniqueDebtCheckedFiles returns an empty list for an empty list", () => {
  assert.deepEqual(filterUniqueDebtCheckedFiles([]), []);
});
