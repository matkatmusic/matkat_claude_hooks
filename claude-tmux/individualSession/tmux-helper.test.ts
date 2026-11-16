#!/usr/bin/env node
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildClaudeCommand, computeNextHelperNumber, stripHelperSuffix } from "./tmux-helper.ts";

test("test_stripHelperSuffix_removes_trailing_helper_number", () => {
    // Chat name ends with ` helper 1`.
    // The base name is the chat name without that suffix.
    assert.equal(stripHelperSuffix("idea 4 helper 1"), "idea 4");
});

test("test_stripHelperSuffix_keeps_name_without_suffix", () => {
    // Chat name has no helper suffix.
    // The base name is the same chat name.
    assert.equal(stripHelperSuffix("idea 4"), "idea 4");
});

test("test_stripHelperSuffix_removes_only_the_last_suffix", () => {
    // Chat name has helper in the middle and a suffix at the end.
    // Only the suffix at the end is removed.
    assert.equal(stripHelperSuffix("helper 2 idea helper 12"), "helper 2 idea");
});

test("test_computeNextHelperNumber_is_one_for_empty_window_list", () => {
    // No windows exist.
    // The first helper number is 1.
    assert.equal(computeNextHelperNumber([], "idea 4"), 1);
});

test("test_computeNextHelperNumber_ignores_other_chats_windows", () => {
    // Windows belong to other chats and to the base chat itself.
    // No helper of this base exists, so the number is 1.
    assert.equal(computeNextHelperNumber(["idea 4", "idea 5 helper 3", "zsh"], "idea 4"), 1);
});

test("test_computeNextHelperNumber_is_highest_plus_one_with_gaps", () => {
    // Helpers 1 and 3 exist, helper 2 was closed.
    // The next number is 4, not 3 and not 2.
    assert.equal(computeNextHelperNumber(["idea 4 helper 1", "idea 4 helper 3"], "idea 4"), 4);
});

test("test_computeNextHelperNumber_compares_numbers_not_text", () => {
    // Helper 9 and helper 10 exist.
    // The next number is 11.
    assert.equal(computeNextHelperNumber(["idea 4 helper 9", "idea 4 helper 10"], "idea 4"), 11);
});

test("test_buildClaudeCommand_without_model", () => {
    // No model was typed.
    // The command holds only the quoted name.
    assert.equal(buildClaudeCommand("idea 4 helper 1", ""), "claude --name 'idea 4 helper 1'");
});

test("test_buildClaudeCommand_with_model", () => {
    // A model word was typed.
    // The command adds the quoted model.
    assert.equal(buildClaudeCommand("idea 4 helper 1", "haiku"), "claude --name 'idea 4 helper 1' --model 'haiku'");
});

test("test_buildClaudeCommand_escapes_single_quotes", () => {
    // The model text holds a single quote.
    // The quote is escaped so the shell cannot run the rest.
    assert.equal(buildClaudeCommand("a", "x'; rm -rf ~; '"), "claude --name 'a' --model 'x'\\''; rm -rf ~; '\\'''");
});
