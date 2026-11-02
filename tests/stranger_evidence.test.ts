import assert from "node:assert/strict";
import { test } from "node:test";
import type { Row } from "./stranger_constants.ts";
import { addRow, containsAssistantText, countEvidence, findEvidence } from "./stranger_evidence.ts";

const HOOK_RECORD = { type: "attachment", attachment: { type: "hook_blocking_error", hookEvent: "Stop", text: "Type errors remain" } };
const ERROR_RECORD = { type: "user", message: { content: [{ type: "tool_result", is_error: true, content: "Test runners are blocked" }] } };

test("findEvidence and countEvidence match hook attachments by event", () => {
  assert.notEqual(findEvidence([HOOK_RECORD], "Type errors", "Stop"), undefined);
  assert.equal(findEvidence([HOOK_RECORD], "Type errors", "PostToolUse"), undefined);
  assert.equal(countEvidence([HOOK_RECORD, HOOK_RECORD], "Type errors", "Stop"), 2);
});

test("findEvidence reads tool errors only when no event is given", () => {
  assert.notEqual(findEvidence([ERROR_RECORD], "Test runners"), undefined);
  assert.equal(findEvidence([ERROR_RECORD], "Test runners", "Stop"), undefined);
});

test("addRow joins the evidence into one line and containsAssistantText finds reply text", () => {
  const rows: Row[] = [];
  addRow(rows, 1, "hook", null, true, "a\n  b");
  assert.equal(rows[0]!.evidence, "a b");
  const reply = { type: "assistant", message: { content: [{ type: "text", text: "Task #20 is still open" }] } };
  assert.equal(containsAssistantText([reply], "still open"), true);
  assert.equal(containsAssistantText([HOOK_RECORD], "still open"), false);
});
