import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

const { parseTeamArguments, buildChatName, buildDirectorPaneCommand, buildDetachedSizeFlags } = await import("./teamCommand.ts");
const { wrapShellWord } = await import("../shared/chatSwap.ts");

test("test_buildDetachedSizeFlags_returns_columns_and_rows_flags", () => {
  // Scenario: the tmux size flags come from the two dispatch values.
  // Step: build the flags from columns 240 and rows 70. Check the list.
  const flags = buildDetachedSizeFlags({ CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DETACHED_COLUMNS: "240", CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DETACHED_ROWS: "70" });
  assert.deepEqual(flags, ["-x", "240", "-y", "70"]);
});

test("test_parseTeamArguments_returns_given_name", () => {
  // Scenario: --name gives the team name.
  // Step: parse --name "feature X". Check the name.
  assert.equal(parseTeamArguments(["--name", "feature X"], "fable").name, "feature X");
});

test("test_parseTeamArguments_throws_without_name", () => {
  // Scenario: a call with no --name fails.
  // Step: parse an empty list. Check that it throws.
  assert.throws(() => parseTeamArguments([], "fable"));
});

test("test_parseTeamArguments_uses_default_model", () => {
  // Scenario: no --model means the default model.
  // Step: parse --name only. Check the model is the default.
  assert.equal(parseTeamArguments(["--name", "feature X"], "fable").model, "fable");
});

test("test_parseTeamArguments_uses_given_model", () => {
  // Scenario: --model overrides the default.
  // Step: parse --name and --model opus. Check the model.
  assert.equal(parseTeamArguments(["--name", "feature X", "--model", "opus"], "fable").model, "opus");
});

// test("test_parseTeamArguments_returns_given_parent", () => {
//   assert.equal(parseTeamArguments(["--name", "feature X jobA", "--parent", "feature X"], "fable").parent, "feature X");
// });

// test("test_parseTeamArguments_has_no_parent_by_default", () => {
//   assert.equal(parseTeamArguments(["--name", "feature X"], "fable").parent, undefined);
// });
test("test_parseTeamArguments_rejects_the_parent_flag", () => {
  // Scenario: startJobTeam.ts replaces --parent.
  // Step: parse --parent. Check that it throws.
  assert.throws(() => parseTeamArguments(["--name", "feature X", "--parent", "other"], "fable"));
});

test("test_parseTeamArguments_accepts_the_team_flag", () => {
  // Scenario: `claude-tmux --team --name X` passes its arguments, --team included, to the team start script.
  // Step: parse --team, --name and a name. Check the result holds the name and the default model.
  assert.deepEqual(parseTeamArguments(["--team", "--name", "feature X"], "fable"), { name: "feature X", model: "fable" });
});

test("test_buildChatName_joins_name_job_and_number", () => {
  // Scenario: the chat name is team name, job, number.
  // Step: build the name. Check the text.
  assert.equal(buildChatName("feature X", "orchestrator", 1), "feature X orchestrator 1");
});

test("test_wrapShellWord_escapes_single_quote", () => {
  // Scenario: a single quote inside a word must survive the shell.
  // Step: wrap "it's". Check the quoting.
  assert.equal(wrapShellWord("it's"), "'it'\\''s'");
});

test("test_buildDirectorPaneCommand_keeps_name_and_starting_text_as_arguments", () => {
  // Scenario: the name and the starting text each stay one argument after two shell layers.
  // Step 1: build the pane command with a starting text of three lines, quotes and a line that starts with "- ".
  const startingText = "first line it's\nsecond \"line\"\n- third line";
  const command = buildDirectorPaneCommand("feature X orchestrator 1", "fable", startingText);
  // Step 2: run it with a fake claude that writes the argument count and a fake zsh that evals its second argument.
  const script = `claude() { printf '%s\\n' "$#"; printf '%s\\n%s' "$5" "$6"; }; zsh() { eval "$2"; }; ${command}`;
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
  // Step 3: check that claude gets six arguments: the fifth is "--" and the sixth is the starting text, character for character.
  assert.equal(result.stdout, `6\n--\n${startingText}`);
});

test("test_buildDirectorPaneCommand_has_no_text_argument_for_empty_starting_text", () => {
  // Scenario: a job chat starts with no starting text, so claude gets no "--" and no text.
  // Step 1: build the pane command with an empty starting text.
  const command = buildDirectorPaneCommand("feature X planner 1", "sonnet", "");
  // Step 2: run it with a fake claude that writes each argument on its own line and a fake zsh that evals its second argument.
  const script = `claude() { printf '%s\\n' "$#"; printf '%s\\n' "$@"; }; zsh() { eval "$2"; }; ${command}`;
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
  // Step 3: check that claude gets exactly four arguments: --name, the name, --model, the model.
  assert.equal(result.stdout, "4\n--name\nfeature X planner 1\n--model\nsonnet\n");
});
