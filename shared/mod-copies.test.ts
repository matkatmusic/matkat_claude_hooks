import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Mods cannot import shared code, so these copies must match.
const REGISTER_PATHS = [
  "ask-dont-dump/mod/hooks/register.ts",
  "idle-state/mod/hooks/register.ts",
  "context-exit/mod/hooks/register.ts",
];

function extractCopy(path: string): string {
  const lines = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").split("\n");
  let dirLine = "";
  let functionStart = -1;
  let functionEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    const isDirLine = lines[i].startsWith("const DISPATCHER_DIR");
    if (isDirLine)
      dirLine = lines[i];
    const isFunctionStart = lines[i].startsWith("async function isEventEnabled");
    if (isFunctionStart)
      functionStart = i;
    const isFunctionEnd = functionStart !== -1 && lines[i] === "}";
    if (isFunctionEnd) {
      functionEnd = i;
      break;
    }
  }
  assert.notEqual(dirLine, "", `${path} has no const DISPATCHER_DIR line`);
  assert.notEqual(functionEnd, -1, `${path} has no isEventEnabled function`);
  return `${dirLine}\n${lines.slice(functionStart, functionEnd + 1).join("\n")}`;
}

test("DISPATCHER_DIR and isEventEnabled copies are identical in all three mods", () => {
  const sourceCopy = extractCopy(REGISTER_PATHS[0]);
  for (let i = 1; i < REGISTER_PATHS.length; i++) {
    const otherCopy = extractCopy(REGISTER_PATHS[i]);
    assert.equal(otherCopy, sourceCopy, `${REGISTER_PATHS[0]} and ${REGISTER_PATHS[i]} differ`);
  }
});
