import { test } from "node:test";
import assert from "node:assert/strict";
import { scanSourceText, listMessagesWithText } from "./lintRuleTestHelper.ts";

const SHEBANG_MAIN_TEXT = "A file with a #! first line needs a main() function";

test("test_shebang_file_without_main_is_flagged", () => {
  // Scenario: a file that starts with '#!' and has no main() function gets one message on line 1.
  const messages = scanSourceText("subject.ts", "#!/usr/bin/env bun\nexport function getName() {\n  return 'a';\n}\n");
  const flagged = listMessagesWithText(messages, SHEBANG_MAIN_TEXT);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].line, 1);
});

test("test_shebang_file_with_main_is_not_flagged", () => {
  // Scenario: a file that starts with '#!' and declares function main() gets no message.
  const messages = scanSourceText("subject.ts", "#!/usr/bin/env bun\nfunction main() {}\nif (import.meta.main) {\n  main();\n}\n");
  assert.equal(listMessagesWithText(messages, SHEBANG_MAIN_TEXT).length, 0);
});

test("test_shebang_file_with_exported_main_is_not_flagged", () => {
  // Scenario: an exported main() function counts as a main() function.
  const messages = scanSourceText("subject.ts", "#!/usr/bin/env bun\nexport function main() {}\n");
  assert.equal(listMessagesWithText(messages, SHEBANG_MAIN_TEXT).length, 0);
});

test("test_file_without_shebang_and_without_main_is_not_flagged", () => {
  // Scenario: a file with no '#!' first line does not need main().
  const messages = scanSourceText("subject.ts", "export function getName() {\n  return 'a';\n}\n");
  assert.equal(listMessagesWithText(messages, SHEBANG_MAIN_TEXT).length, 0);
});
