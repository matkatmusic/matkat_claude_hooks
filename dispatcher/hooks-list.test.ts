import { test } from "node:test";
import { strict as assert } from "node:assert";
import { existsSync } from "node:fs";
import { HOOKS } from "./hooks-list.ts";

test("every enabled hook points at a script that exists", () => {
  const missingScripts: string[] = [];
  for (const entry of HOOKS) {
    const scriptPath = entry.command[1];
    const isEnabled = entry.enabled;
    const scriptExists = existsSync(scriptPath);
    const isMissing = isEnabled && !scriptExists;
    if (isMissing) {
      missingScripts.push(scriptPath);
    }
  }
  assert.deepEqual(missingScripts, []);
});
