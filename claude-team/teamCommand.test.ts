import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";

const { parseTeamArguments, buildChatName, wrapShellWord, buildDirectorPaneCommand } = await import("./teamCommand.ts");

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

test("test_buildDirectorPaneCommand_keeps_name_as_one_argument", () => {
  // Scenario: a name with spaces stays one argument after two shell layers.
  // Step 1: build the pane command.
  const command = buildDirectorPaneCommand("feature X orchestrator 1", "fable");
  // Step 2: run it with a fake claude and a fake zsh that evals its second argument.
  const script = `claude() { printf '%s\\n' "$@"; }; zsh() { eval "$2"; }; ${command}`;
  const result = spawnSync("sh", ["-c", script], { encoding: "utf8" });
  // Step 3: check that the arguments arrive one per line.
  assert.equal(result.stdout, "--name\nfeature X orchestrator 1\n--model\nfable\n");
});
