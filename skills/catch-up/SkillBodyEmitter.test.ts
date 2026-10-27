#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildSkillBody } from "./SkillBodyEmitter.ts";

async function buildThrowsWhenTaskListIdIsUnset() {
  const saved = process.env.CLAUDE_CODE_TASK_LIST_ID;
  delete process.env.CLAUDE_CODE_TASK_LIST_ID;
  await assert.rejects(buildSkillBody(), /CLAUDE_CODE_TASK_LIST_ID is not set/);
  if (saved !== undefined)
    process.env.CLAUDE_CODE_TASK_LIST_ID = saved;
}

test("buildSkillBody throws when CLAUDE_CODE_TASK_LIST_ID is unset", buildThrowsWhenTaskListIdIsUnset);
