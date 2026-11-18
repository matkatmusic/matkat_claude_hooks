#!/usr/bin/env bun
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// import { buildClaudeCommand, computeNextHelperNumber, stripHelperSuffix } from "./tmuxHelper.ts";
// import { computeNextHelperNumberFromChatTitles, getHelperBaseName, getHelperModel, getLastCustomTitleOfEachTranscript, stripHelperSuffix } from "./tmuxHelper.ts";
import { getHelperBaseName, getHelperModel, parseNewHelperArguments, stripHelperSuffix } from "./tmuxHelper.ts";

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

// test("test_computeNextHelperNumber_is_one_for_empty_window_list", () => {
//     // No windows exist.
//     // The first helper number is 1.
//     assert.equal(computeNextHelperNumber([], "idea 4"), 1);
// });
//
// test("test_computeNextHelperNumber_ignores_other_chats_windows", () => {
//     // Windows belong to other chats and to the base chat itself.
//     // No helper of this base exists, so the number is 1.
//     assert.equal(computeNextHelperNumber(["idea 4", "idea 5 helper 3", "zsh"], "idea 4"), 1);
// });
//
// test("test_computeNextHelperNumber_is_highest_plus_one_with_gaps", () => {
//     // Helpers 1 and 3 exist, helper 2 was closed.
//     // The next number is 4, not 3 and not 2.
//     assert.equal(computeNextHelperNumber(["idea 4 helper 1", "idea 4 helper 3"], "idea 4"), 4);
// });
//
// test("test_computeNextHelperNumber_compares_numbers_not_text", () => {
//     // Helper 9 and helper 10 exist.
//     // The next number is 11.
//     assert.equal(computeNextHelperNumber(["idea 4 helper 9", "idea 4 helper 10"], "idea 4"), 11);
// });
//
// test("test_buildClaudeCommand_without_model", () => {
//     // No model was typed.
//     // The command holds only the quoted name.
//     assert.equal(buildClaudeCommand("idea 4 helper 1", ""), "claude --name 'idea 4 helper 1'");
// });
//
// test("test_buildClaudeCommand_with_model", () => {
//     // A model word was typed.
//     // The command adds the quoted model.
//     assert.equal(buildClaudeCommand("idea 4 helper 1", "haiku"), "claude --name 'idea 4 helper 1' --model 'haiku'");
// });
//
// test("test_buildClaudeCommand_escapes_single_quotes", () => {
//     // The model text holds a single quote.
//     // The quote is escaped so the shell cannot run the rest.
//     assert.equal(buildClaudeCommand("a", "x'; rm -rf ~; '"), "claude --name 'a' --model 'x'\\''; rm -rf ~; '\\'''");
// });

// test("test_computeNextHelperNumberFromChatTitles_is_one_for_no_titles", () => {
//     // No chat titles exist.
//     // The first helper number is 1.
//     assert.equal(computeNextHelperNumberFromChatTitles([], "bed"), 1);
// });
//
// test("test_computeNextHelperNumberFromChatTitles_is_highest_helper_plus_one", () => {
//     // Helper numbers 1 and 2 exist, with chat numbers after them.
//     // The next helper number is 3.
//     assert.equal(computeNextHelperNumberFromChatTitles(["bed helper 1 1", "bed helper 1 2", "bed helper 2 1"], "bed"), 3);
// });
//
// test("test_computeNextHelperNumberFromChatTitles_counts_old_titles_with_no_chat_number", () => {
//     // An old title has a helper number and no chat number.
//     // The old helper number still counts, so the next number is 4.
//     assert.equal(computeNextHelperNumberFromChatTitles(["bed helper 3"], "bed"), 4);
// });
//
// test("test_computeNextHelperNumberFromChatTitles_ignores_other_chats_and_nested_names", () => {
//     // Titles belong to the base chat itself, to other chats, and to a nested helper name.
//     // No helper of this base exists, so the number is 1.
//     assert.equal(computeNextHelperNumberFromChatTitles(["bed", "bed 2", "bedroom helper 5 1", "other helper 7 1", "bed helper 1 helper 2 1"], "bed"), 1);
// });
//
// test("test_computeNextHelperNumberFromChatTitles_compares_numbers_not_text", () => {
//     // Helper 9 and helper 10 exist.
//     // The next number is 11.
//     assert.equal(computeNextHelperNumberFromChatTitles(["bed helper 9 1", "bed helper 10 1"], "bed"), 11);
// });
//
// test("test_getLastCustomTitleOfEachTranscript_keeps_the_last_title_of_each_file", () => {
//     // The input is rg output with a file path, a null character, and one JSON line.
//     // File a has two titles, and file b has one title.
//     const customTitleLines =
//         "/p/a.jsonl\0" + '{"type":"custom-title","customTitle":"bed helper 1 1","sessionId":"a"}' + "\n" +
//         "/p/a.jsonl\0" + '{"type":"custom-title","customTitle":"bed helper 1 2","sessionId":"a"}' + "\n" +
//         "/p/b.jsonl\0" + '{"type":"custom-title","customTitle":"bed helper 2 1","sessionId":"b"}' + "\n";
//     // Only the last title of each file stays.
//     const result = getLastCustomTitleOfEachTranscript(customTitleLines);
//     assert.deepEqual(result.sort(), ["bed helper 1 2", "bed helper 2 1"]);
// });
//
// test("test_getLastCustomTitleOfEachTranscript_is_empty_for_no_lines", () => {
//     // The input is an empty string.
//     // The result is an empty list.
//     assert.deepEqual(getLastCustomTitleOfEachTranscript(""), []);
// });

test("test_getHelperBaseName_uses_claude_tmux_name", () => {
    // The Claude tmux name is bed and the session title is bed 3.
    // The base name is the Claude tmux name.
    assert.equal(getHelperBaseName("bed", "bed 3"), "bed");
});

// test("test_getHelperBaseName_strips_helper_suffix_of_claude_tmux_name", () => {
//     // The Claude tmux name ends with a helper suffix.
//     // The base name is the Claude tmux name without that suffix.
//     assert.equal(getHelperBaseName("bed helper 1", "bed helper 1 2"), "bed");
// });

test("test_getHelperBaseName_removes_helper_word_of_a_helper_claude_tmux_name", () => {
    // A helper chat has the Claude tmux name "bed helper", with no number.
    // The base name is the Claude tmux name without the word helper.
    assert.equal(getHelperBaseName("bed helper", "bed helper 3"), "bed");
});

test("test_getHelperBaseName_uses_session_title_without_claude_tmux_name", () => {
    // No Claude tmux name exists.
    // The base name is the session title without its helper suffix.
    assert.equal(getHelperBaseName(undefined, "idea 4 helper 1"), "idea 4");
});

test("test_getHelperBaseName_throws_without_any_name", () => {
    // Neither a Claude tmux name nor a session title exists.
    // The function throws.
    assert.throws(() => getHelperBaseName(undefined, undefined));
});

test("test_getHelperModel_uses_default_when_no_model_is_typed", () => {
    // No model was typed.
    // The model is the default helper model.
    assert.equal(getHelperModel("", "sonnet"), "sonnet");
});

test("test_getHelperModel_uses_typed_model", () => {
    // A model word was typed.
    // The model is the typed model.
    assert.equal(getHelperModel("haiku", "sonnet"), "haiku");
});

test("test_parseNewHelperArguments_reads_number_only", () => {
    // The text is only a number.
    // The helper count is that number and the model is empty.
    assert.deepEqual(parseNewHelperArguments("3"), { helperCount: 3, model: "" });
});

test("test_parseNewHelperArguments_reads_number_and_model", () => {
    // The text is a number and then a model word.
    // The helper count is the number and the model is the word.
    assert.deepEqual(parseNewHelperArguments("3 opus"), { helperCount: 3, model: "opus" });
});

test("test_parseNewHelperArguments_reads_model_only", () => {
    // The text is only a model word.
    // The helper count is 1 and the model is the word.
    assert.deepEqual(parseNewHelperArguments("opus"), { helperCount: 1, model: "opus" });
});

test("test_parseNewHelperArguments_reads_empty_text", () => {
    // The text is empty.
    // The helper count is 1 and the model is empty.
    assert.deepEqual(parseNewHelperArguments(""), { helperCount: 1, model: "" });
});

test("test_parseNewHelperArguments_throws_for_model_then_number", () => {
    // The text is a model word and then a number.
    // The function throws.
    assert.throws(() => parseNewHelperArguments("opus 3"));
});

test("test_parseNewHelperArguments_throws_for_zero", () => {
    // The number is 0.
    // The function throws.
    assert.throws(() => parseNewHelperArguments("0"));
});

test("test_tmuxNewHelper_throws_outside_a_git_repository", () => {
    // Step 1: make a folder that is not inside a git repository.
    const plainFolder = mkdtempSync(join(tmpdir(), "tmux-helper-plain-"));
    // Step 2: prove that git fails in that folder.
    const gitCheck = spawnSync("git", ["-C", plainFolder, "rev-parse"], { encoding: "utf8" });
    assert.notEqual(gitCheck.status, 0);
    // Step 3: run the script with a copy of the environment that has no swap or name values.
    // const environment = { ...process.env, TMUX_PANE: "%999" };
    const environment: NodeJS.ProcessEnv = { ...process.env, TMUX_PANE: "%999" };
    delete environment.CLAUDE_TMUX_SWAP_PERCENT;
    delete environment.CLAUDE_TMUX_NAME;
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/tmuxHelper.ts`], {
        encoding: "utf8",
        cwd: plainFolder,
        input: JSON.stringify({ prompt: "/tmux-new-helper", cwd: plainFolder, session_title: "t", transcript_path: join(plainFolder, "t.jsonl") }),
        env: environment,
    });
    // Step 4: the script fails and tells the user a git repository is needed.
    assert.notEqual(scriptResult.status, 0);
    assert.match(scriptResult.stderr, /inside a git repository/);
});

test("test_tmux_helper_ignores_the_tmux_switch_prompt", () => {
    // Step 1: make a copy of the environment that has no tmux pane.
    const environment: NodeJS.ProcessEnv = { ...process.env };
    delete environment.TMUX_PANE;
    // Step 2: run the script with the /tmux-switch prompt.
    const scriptResult = spawnSync("bun", [`${import.meta.dirname}/tmuxHelper.ts`], {
        encoding: "utf8",
        input: JSON.stringify({ prompt: "/tmux-switch", cwd: join(import.meta.dirname, "..", "..") }),
        env: environment,
    });
    // Step 3: the script exits with code 0 and prints nothing.
    assert.equal(scriptResult.status, 0);
    assert.equal(scriptResult.stdout, "");
});
