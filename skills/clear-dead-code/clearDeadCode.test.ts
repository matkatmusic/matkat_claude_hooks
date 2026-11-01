#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearDeadCode, clearDeadCodeInPath } from "./clearDeadCode.ts";

function removesCodeAndKeepsProse() {
  const source = [
    "const a = 1;",
    "// This explains the next part.",
    "// const b = 2;",
    "// const c = 3;",
    "// return b + c;",
    "const d = 4;",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, "const a = 1;\n// This explains the next part.\nconst d = 4;");
  assert.equal(result.removed, 3);
}

function removesWholeCommentedCall() {
  const source = [
    "// doThing(first,",
    "//   someArg,",
    "// );",
    "keep();",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, "keep();");
  assert.equal(result.removed, 3);
}

function keepsEverythingElse() {
  const source = [
    "/// keep me",
    "/* const x = 1; */",
    "/**",
    " * const y = 2;",
    " */",
    "// eslint-disable-next-line",
    "// This is only a plain sentence about the code.",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, source);
  assert.equal(result.removed, 0);
}

function removesMermaidCommentsOnly() {
  const source = [
    "%% A --> B",
    "%% nodeA[Label]",
    "%% section notes about layer two",
    "%%{init: {\"theme\": \"dark\"}}%%",
    "flowchart TD",
  ].join("\n");
  const result = clearDeadCode(source, true);
  assert.equal(
    result.text,
    "%% section notes about layer two\n%%{init: {\"theme\": \"dark\"}}%%\nflowchart TD",
  );
  assert.equal(result.removed, 2);
}

function keepsPercentLinesInNonMermaidFiles() {
  const source = "%% A --> B\nconst a = 1;";
  const result = clearDeadCode(source, false);
  assert.equal(result.text, source);
  assert.equal(result.removed, 0);
}

function removesBlankCommentLinesBetweenCode() {
  const source = [
    "// a();",
    "//",
    "// b();",
    "//",
    "// c();",
    "keep();",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, "keep();");
  assert.equal(result.removed, 5);
}

function removesBlockOfCommentedOutCode() {
  const source = [
    "/*",
    "const a = 1;",
    "const b = 2;",
    "return a + b;",
    "*/",
    "keep();",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, "keep();");
  assert.equal(result.removed, 5);
}

function keepsBlockOfMostlyProse() {
  const source = [
    "/*",
    "This explains why the next part exists.",
    "It was written after a long talk with the team.",
    "Please read it before you change anything here.",
    "const a = 1;",
    "*/",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, source);
  assert.equal(result.removed, 0);
}

function removesCommentedOutNameList() {
  const source = [
    "const list = [",
    "  a,",
    "  // first, second, third,",
    "  b,",
    "];",
  ].join("\n");
  const result = clearDeadCode(source, false);
  assert.equal(result.text, "const list = [\n  a,\n  b,\n];");
  assert.equal(result.removed, 1);
}

function clearsDeadCodeInsideSubmodule() {
  const root = mkdtempSync(join(tmpdir(), "clear-dead-code-"));
  const innerPath = join(root, "inner");
  const outerPath = join(root, "outer");
  mkdirSync(innerPath);
  mkdirSync(outerPath);
  const commitIdentity = ["-c", "user.name=test", "-c", "user.email=test@test"];
  execFileSync("git", ["init"], { cwd: innerPath });
  writeFileSync(join(innerPath, "inner.ts"), "keep();\n// doThing();\n");
  execFileSync("git", ["add", "."], { cwd: innerPath });
  execFileSync("git", [...commitIdentity, "commit", "-m", "inner"], { cwd: innerPath });
  execFileSync("git", ["init"], { cwd: outerPath });
  execFileSync("git", ["-c", "protocol.file.allow=always", "submodule", "add", innerPath, "sub"], { cwd: outerPath });
  execFileSync("git", [...commitIdentity, "commit", "-m", "outer"], { cwd: outerPath });
  clearDeadCodeInPath(outerPath);
  assert.equal(readFileSync(join(outerPath, "sub", "inner.ts"), "utf8"), "keep();\n");
}

test("removes code lines and keeps the prose line above", removesCodeAndKeepsProse);
test("removes a commented-out call with a middle argument line", removesWholeCommentedCall);
test("keeps triple slash, block comments, directives, and prose", keepsEverythingElse);
test("removes mermaid code comments and keeps notes and directives", removesMermaidCommentsOnly);
test("keeps percent lines when the file is not mermaid", keepsPercentLinesInNonMermaidFiles);
test("clears dead code inside a submodule", clearsDeadCodeInsideSubmodule);
test("removes blank comment lines between commented-out code", removesBlankCommentLinesBetweenCode);
test("removes a block comment that is mostly code", removesBlockOfCommentedOutCode);
test("keeps a block comment that is mostly prose", keepsBlockOfMostlyProse);
test("removes a commented-out list of names", removesCommentedOutNameList);
