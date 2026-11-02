import assert from "node:assert/strict";
import { test } from "node:test";
import { findSnippet, formatOneLine, listFilesWithSuffix, wrapShellWord } from "./stranger_helpers.ts";

test("wrapShellWord quotes a single quote", () => {
  assert.equal(wrapShellWord("a'b"), "'a'\\''b'");
});

test("findSnippet returns undefined without the needle and text around it with it", () => {
  assert.equal(findSnippet("abc", "x"), undefined);
  assert.equal(findSnippet("abc", "b"), "abc");
});

test("formatOneLine joins words with one space", () => {
  assert.equal(formatOneLine("  a \n b\t c "), "a b c");
});

test("listFilesWithSuffix returns an empty list for a missing folder", () => {
  assert.deepEqual(listFilesWithSuffix("/no/such/stranger/folder", ".json"), []);
});
