import assert from "node:assert/strict";
import { test } from "node:test";
import { buildBed, copyUntrackedFiles, createProject } from "./stranger_bed.ts";

test("buildBed takes a bed and a config folder", () => {
  assert.equal(buildBed.length, 2);
});

test("copyUntrackedFiles and createProject take the arguments the test bed passes", () => {
  assert.equal(copyUntrackedFiles.length, 2);
  assert.equal(createProject.length, 1);
});
