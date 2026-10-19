#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { clearDeadCode } from "./clearDeadCode.ts";

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

test("removes code lines and keeps the prose line above", removesCodeAndKeepsProse);
test("removes a commented-out call with a middle argument line", removesWholeCommentedCall);
test("keeps triple slash, block comments, directives, and prose", keepsEverythingElse);
test("removes mermaid code comments and keeps notes and directives", removesMermaidCommentsOnly);
test("keeps percent lines when the file is not mermaid", keepsPercentLinesInNonMermaidFiles);
