import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Row, Session } from "./stranger_constants.ts";
import { addIdleProgramRow, executeSecondSession } from "./stranger_second.ts";

test("addIdleProgramRow passes when the state file lists the running idle program", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "stranger-second-"));
  const stateFile = path.join(folder, "state.json");
  writeFileSync(stateFile, JSON.stringify({ runningPrograms: [{ command: "bash ./server+80.sh", isRunning: true, pids: [7] }] }));
  const session: Session = { name: "%1", id: "x", model: "m", projectsDir: folder, knownJsonlFiles: new Set(), jsonlPath: null, bed: folder };
  const rows: Row[] = [];
  addIdleProgramRow(rows, session, [stateFile]);
  assert.equal(rows[0]!.ok, true);
  assert.equal(rows[0]!.number, 44);
});

test("addIdleProgramRow fails when no state file lists the idle program", () => {
  const folder = mkdtempSync(path.join(tmpdir(), "stranger-second-"));
  const session: Session = { name: "%1", id: "x", model: "m", projectsDir: folder, knownJsonlFiles: new Set(), jsonlPath: null, bed: folder };
  const rows: Row[] = [];
  addIdleProgramRow(rows, session, []);
  assert.equal(rows[0]!.ok, false);
  assert.equal(executeSecondSession.length, 3);
});
