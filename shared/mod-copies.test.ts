import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

// Mods cannot import shared code, so these copies must match.
const REGISTER_PATHS = [
  "anything-for-me/mod/hooks/register.ts",
  "ask-dont-dump/mod/hooks/register.ts",
  "idle-state/mod/hooks/register.ts",
  "context-exit/mod/hooks/register.ts",
  "prompt-intent/mod/hooks/register.ts",
];

const VALUE_REGISTER_PATHS = [
  "idle-state/mod/hooks/register.ts",
  "context-exit/mod/hooks/register.ts",
];

function extractCopy(path: string, functionNames = ["parseDefaultFile", "parseUserFile", "getEnablement", "readDefault", "readUser", "isEventEnabled"]): string {
  const lines = readFileSync(new URL(`../${path}`, import.meta.url), "utf8").split("\n");
  let dirLine = "";
  for (let i = 0; i < lines.length; i++) {
    const isDirLine = lines[i].startsWith("const DISPATCHER_DIR");
    if (isDirLine)
      dirLine = lines[i];
  }
  assert.notEqual(dirLine, "", `${path} has no const DISPATCHER_DIR line`);
  let copy = dirLine;
  for (let n = 0; n < functionNames.length; n++) {
    let functionStart = -1;
    let functionEnd = -1;
    for (let i = 0; i < lines.length; i++) {
      const isAsyncFunctionStart = lines[i].startsWith(`async function ${functionNames[n]}(`);
      const isSyncFunctionStart = lines[i].startsWith(`function ${functionNames[n]}(`);
      const isFunctionStart = isAsyncFunctionStart || isSyncFunctionStart;
      if (isFunctionStart)
        functionStart = i;
      const isFunctionEnd = functionStart !== -1 && lines[i] === "}";
      if (isFunctionEnd) {
        functionEnd = i;
        break;
      }
    }
    assert.notEqual(functionEnd, -1, `${path} has no ${functionNames[n]} function`);
    copy += `\n${lines.slice(functionStart, functionEnd + 1).join("\n")}`;
  }
  return copy;
}

function assertEnablementCopiesAreIdentical(): void {
  const sourceCopy = extractCopy(REGISTER_PATHS[0]);
  for (let i = 1; i < REGISTER_PATHS.length; i++) {
    const otherCopy = extractCopy(REGISTER_PATHS[i]);
    assert.equal(otherCopy, sourceCopy, `${REGISTER_PATHS[0]} and ${REGISTER_PATHS[i]} differ`);
  }
}

function assertValueCopiesAreIdentical(): void {
  const sourceCopy = extractCopy(VALUE_REGISTER_PATHS[0], ["getValue", "readValue"]);
  const otherCopy = extractCopy(VALUE_REGISTER_PATHS[1], ["getValue", "readValue"]);
  assert.equal(otherCopy, sourceCopy, `${VALUE_REGISTER_PATHS[0]} and ${VALUE_REGISTER_PATHS[1]} differ`);
}

const LOG_FAILURE_PATHS = [
  "anything-for-me/mod/hooks/logHookFailure.ts",
  "ask-dont-dump/mod/hooks/logHookFailure.ts",
  "idle-state/mod/hooks/logHookFailure.ts",
  "context-exit/mod/hooks/logHookFailure.ts",
  "prompt-intent/mod/hooks/logHookFailure.ts",
];

function assertLogFailureCopiesAreIdentical(): void {
  const sourceText = readFileSync(new URL(`../${LOG_FAILURE_PATHS[0]}`, import.meta.url), "utf8");
  for (let i = 1; i < LOG_FAILURE_PATHS.length; i++) {
    const otherText = readFileSync(new URL(`../${LOG_FAILURE_PATHS[i]}`, import.meta.url), "utf8");
    assert.equal(otherText, sourceText, `${LOG_FAILURE_PATHS[0]} and ${LOG_FAILURE_PATHS[i]} differ`);
  }
}

test("logHookFailure.ts copies are identical in all five mods", assertLogFailureCopiesAreIdentical);

test("DISPATCHER_DIR, parse, look-up, readDefault, readUser and isEventEnabled copies are identical in all three mods", assertEnablementCopiesAreIdentical);

test("getValue and readValue copies are identical in the idle-state and context-exit mods", assertValueCopiesAreIdentical);
