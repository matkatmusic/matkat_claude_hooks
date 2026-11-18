import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const dispatchSettings = JSON.parse(readFileSync(`${import.meta.dirname}/../../dispatcher/dispatch.json`, "utf8"));
const tmuxValues: Record<string, string | string[]> = dispatchSettings.values["claude-tmux"] ?? {};
const contextExitValues: Record<string, string | string[]> = dispatchSettings.values["context-exit"];

const tmuxValueKeys = [
  "CLAUDE_HOOKS_CLAUDE_TMUX_MODEL",
  "CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_MODEL",
  "CLAUDE_HOOKS_CLAUDE_TMUX_DIALOG_WAIT_SECONDS",
  "CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_WAIT_SECONDS",
  "CLAUDE_HOOKS_CLAUDE_TMUX_CLOSE_WAIT_SECONDS",
  "CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND",
  "CLAUDE_HOOKS_CLAUDE_TMUX_TAKEOVER_PROMPT",
  "CLAUDE_HOOKS_CLAUDE_TMUX_SWAP_FAILED_NOTICE",
  "CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE",
  "CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_SUPERVISOR_PROMPT",
];
const joinValue = (valueKey: string): string => [tmuxValues[valueKey]].flat().join("\n");
const listFieldNames = (text: string): string[] => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();

test("test_tmuxValues_have_every_key_that_the_claude_tmux_scripts_read", () => {
  // // Scenario: each of the 7 keys of the single chat exists in values["claude-tmux"].
  // Scenario: each of the 8 keys of the single chat exists in values["claude-tmux"].
  // Step: for each key, check that the value exists.
  for (const valueKey of tmuxValueKeys) {
    assert.notEqual(tmuxValues[valueKey], undefined, `missing key ${valueKey}`);
  }
});

test("test_tmuxValues_helper_model_is_sonnet", () => {
  // Scenario: a /tmux-new-helper chat with no typed model uses sonnet.
  // Step: read the helper model value. Check that it is "sonnet".
  assert.equal(tmuxValues["CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_MODEL"], "sonnet");
});

test("test_tmuxValues_texts_use_only_fields_that_the_scripts_give", () => {
  // Scenario: each text uses only the {field} names that the scripts give.
  // Step: join each text. List the {field} names of the text. Check the list.
  // assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND")), ["sessionId"]);
  // the handoff command does not tell the chat its session id
  assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_HANDOFF_COMMAND")), []);
  assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TAKEOVER_PROMPT")), ["handoffPath", "oldChatName"]);
  assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_SWAP_FAILED_NOTICE")), ["logPath"]);
  assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_HELPERS_CREATED_NOTICE")), ["helperHandles"]);
  assert.deepEqual(listFieldNames(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_HELPER_SUPERVISOR_PROMPT")), ["supervisorBaseName", "supervisorHandle"]);
});

test("test_tmuxValues_hold_one_line_in_each_string", () => {
  // Scenario: no string of the section holds a line break.
  // Step: for each value, put the value in a list. Check each string of the list.
  assert.notEqual(Object.keys(tmuxValues).length, 0);
  for (const [valueKey, value] of Object.entries(tmuxValues)) {
    for (const text of [value].flat()) {
      assert.equal(/[\r\n]/.test(text), false, `line break in ${valueKey}`);
    }
  }
});

test("test_tmuxValues_have_no_angle_brackets", () => {
  // Scenario: no string of the section holds < or >.
  // Step: for each value, check each string of the value.
  assert.notEqual(Object.keys(tmuxValues).length, 0);
  for (const [valueKey, value] of Object.entries(tmuxValues)) {
    for (const text of [value].flat()) {
      assert.equal(/[<>]/.test(text), false, `angle bracket in ${valueKey}`);
    }
  }
});

test("test_tmuxValues_wait_seconds_are_whole_numbers", () => {
  // Scenario: the three _WAIT_SECONDS values are whole numbers above 0.
  // Step: for each wait key, read the value. Check that it is a whole number string above 0.
  const waitKeys = tmuxValueKeys.filter((valueKey) => valueKey.endsWith("_WAIT_SECONDS"));
  assert.equal(waitKeys.length, 3);
  for (const valueKey of waitKeys) {
    const value = tmuxValues[valueKey];
    assert.equal(typeof value, "string", `${valueKey} is not a string`);
    assert.match(value as string, /^[0-9]+$/, `${valueKey} is not a whole number`);
    assert.ok(Number(value) > 0, `${valueKey} is not above 0`);
  }
});

test("test_contextExitValues_have_the_single_chat_toast_and_drop_reason_as_strings", () => {
  // Scenario: both new context-exit keys are plain strings, because readValue does not join arrays.
  // Step: for each key, check that the value is a string.
  assert.equal(typeof contextExitValues["CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_SWAP_TOAST"], "string");
  assert.equal(typeof contextExitValues["CLAUDE_HOOKS_CONTEXT_EXIT_SINGLE_CHAT_PROMPT_DROP_REASON"], "string");
});
