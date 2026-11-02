import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Session } from "./stranger_constants.ts";
import { executeExitRows, executeStopFailureRow, readSittingTurns } from "./stranger_exit.ts";

test("readSittingTurns reads the turns of the last sitting", () => {
  const bed = mkdtempSync(path.join(tmpdir(), "stranger-exit-"));
  mkdirSync(path.join(bed, "state"));
  writeFileSync(path.join(bed, "state", "abc.json"), JSON.stringify({ sittings: [{ turns: 4 }, { turns: 1 }] }));
  const session: Session = { name: "%1", id: "abc", model: "m", projectsDir: bed, knownJsonlFiles: new Set(), jsonlPath: null, bed };
  assert.equal(readSittingTurns(bed, session), 1);
});

test("the exit row runners take rows and a bed", () => {
  assert.equal(executeExitRows.length, 3);
  assert.equal(executeStopFailureRow.length, 3);
});
