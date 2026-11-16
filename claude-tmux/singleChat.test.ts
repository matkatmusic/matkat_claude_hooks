import { test } from "node:test";
import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { parseSingleChatArguments, buildSingleChatName, buildSingleChatEnvironmentFlags, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord, readSwapRecord, getSwapFailedAction } = await import("./singleChat.ts");
const { buildDirectorPaneCommand } = await import("../claude-team/teamCommand.ts");

test("test_parseSingleChatArguments_returns_the_given_name", () => {
  // Scenario: the arguments hold a name.
  // Step 1: parse the arguments with a name.
  const parsedArguments = parseSingleChatArguments(["--name", "bed"], "fable");
  // Step 2: check that the name is the given name.
  assert.equal(parsedArguments.name, "bed");
});

test("test_parseSingleChatArguments_uses_the_default_model_without_a_model_flag", () => {
  // Scenario: the arguments hold no model.
  // Step 1: parse the arguments with a name and no model.
  const parsedArguments = parseSingleChatArguments(["--name", "bed"], "fable");
  // Step 2: check that the model is the default model.
  assert.equal(parsedArguments.model, "fable");
});

test("test_parseSingleChatArguments_uses_the_given_model", () => {
  // Scenario: the arguments hold a model.
  // Step 1: parse the arguments with a name and a model.
  const parsedArguments = parseSingleChatArguments(["--name", "bed", "--model", "haiku"], "fable");
  // Step 2: check that the model is the given model.
  assert.equal(parsedArguments.model, "haiku");
});

test("test_parseSingleChatArguments_throws_without_a_name", () => {
  // Scenario: the arguments are empty.
  // Step: parse them. Check that it throws the name error.
  assert.throws(() => parseSingleChatArguments([], "fable"), /claude-tmux needs --name/);
});

test("test_parseSingleChatArguments_throws_for_an_unknown_flag", () => {
  // Scenario: the arguments hold a flag that the single chat does not know.
  // Step: parse them. Check that it throws.
  assert.throws(() => parseSingleChatArguments(["--name", "bed", "--job", "x"], "fable"));
});

test("test_buildSingleChatName_joins_the_name_and_the_number", () => {
  // Scenario: a session name and a chat number.
  // Step: build the chat name. Check that the name and the number are joined with a space.
  assert.equal(buildSingleChatName("bed", 2), "bed 2");
});

test("test_buildSingleChatEnvironmentFlags_returns_four_pairs", () => {
  // Scenario: a session name, a chat number, a model and a work folder.
  // Step: build the flags. Check that each of the four values has its own -e pair.
  assert.deepEqual(buildSingleChatEnvironmentFlags("bed", 2, "haiku", "/w"), ["-e", "CLAUDE_TMUX_NAME=bed", "-e", "CLAUDE_TMUX_CHAT_NUMBER=2", "-e", "CLAUDE_TMUX_MODEL=haiku", "-e", "CLAUDE_TMUX_WORK_DIRECTORY=/w"]);
});

test("test_buildSingleChatPaneCommand_gives_the_same_command_as_the_team_pane_command", () => {
  // Scenario: a starting text that has quotes and line breaks.
  // Step 1: make the text.
  const startingText = "say \"hi\" and 'bye'\nsecond line\nthird line";
  // Step 2: build the command with the single chat function and with the team function.
  const singleChatCommand = buildSingleChatPaneCommand("bed 1", "fable", startingText);
  const teamCommand = buildDirectorPaneCommand("bed 1", "fable", startingText);
  // Step 3: check that both commands are equal.
  assert.equal(singleChatCommand, teamCommand);
});

test("test_buildSingleChatPaneCommand_has_no_text_argument_for_an_empty_starting_text", () => {
  // Scenario: the starting text is empty.
  // Step 1: build the command with the single chat function and with the team function.
  const singleChatCommand = buildSingleChatPaneCommand("bed 1", "fable", "");
  const teamCommand = buildDirectorPaneCommand("bed 1", "fable", "");
  // Step 2: check that both commands are equal.
  assert.equal(singleChatCommand, teamCommand);
});

test("test_buildSwapRecordPath_puts_the_session_file_in_the_claude_tmux_folder", () => {
  // Scenario: a state folder and an old session id.
  // Step: build the path. Check that the file is in the claude-tmux folder and is named by the session id.
  assert.equal(buildSwapRecordPath("/s", "sess-1"), "/s/claude-tmux/sess-1.json");
});

test("test_writeSwapRecord_then_readSwapRecord_returns_the_same_record", () => {
  // Scenario: write a record into a folder that does not exist yet, then read it.
  // Step 1: choose a path inside a sub folder that does not exist yet.
  const swapRecordPath = join(mkdtempSync(join(tmpdir(), "single-chat-")), "claude-tmux", "sess-1.json");
  // Step 2: write the record.
  const swapRecord = { newChatName: "bed 2", newPane: "%5", isNewChatReady: false };
  writeSwapRecord(swapRecordPath, swapRecord);
  // Step 3: read the record. Check that it equals the written record.
  assert.deepEqual(readSwapRecord(swapRecordPath), swapRecord);
});

test("test_getSwapFailedAction_undoes_the_swap_without_a_record", () => {
  // Scenario: no swap record exists.
  // Step: ask for the action. Check that the swap is undone.
  assert.equal(getSwapFailedAction(undefined), "undoSwap");
});

test("test_getSwapFailedAction_undoes_the_swap_when_no_new_pane_exists", () => {
  // Scenario: the record has an empty new pane.
  // Step: ask for the action. Check that the swap is undone.
  assert.equal(getSwapFailedAction({ newChatName: "bed 2", newPane: "", isNewChatReady: false }), "undoSwap");
});

test("test_getSwapFailedAction_closes_the_new_chat_when_it_is_not_ready", () => {
  // Scenario: the new pane exists and the new chat is not ready.
  // Step: ask for the action. Check that the new chat is closed and the swap is undone.
  assert.equal(getSwapFailedAction({ newChatName: "bed 2", newPane: "%5", isNewChatReady: false }), "closeNewChatAndUndoSwap");
});

test("test_getSwapFailedAction_keeps_the_new_chat_when_it_is_ready", () => {
  // Scenario: the new chat is ready.
  // Step: ask for the action. Check that the new chat is kept.
  assert.equal(getSwapFailedAction({ newChatName: "bed 2", newPane: "%5", isNewChatReady: true }), "keepNewChat");
});
