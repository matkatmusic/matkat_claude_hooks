import { test } from "node:test";
import { strict as assert } from "node:assert";
// import { spawnSync } from "node:child_process";
import { spawn, spawnSync } from "node:child_process";
// import { mkdtempSync } from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// const { parseSingleChatArguments, buildSingleChatName, buildSingleChatEnvironmentFlags, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord, readSwapRecord, getSwapFailedAction, validateSwapPercentText } = await import("./singleChat.ts");
// const { parseSingleChatArguments, buildSingleChatName, buildSingleChatEnvironmentFlags, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord, readSwapRecord, getSwapFailedAction, validateSwapPercentText, buildTrackerPath, computeNextChatNumber, updateTrackerWithNextChatNumber, openTrackerOfPane } = await import("./singleChat.ts");
const { parseSingleChatArguments, buildSingleChatName, buildSingleChatEnvironmentFlags, buildSingleChatPaneCommand, buildSwapRecordPath, writeSwapRecord, readSwapRecord, getSwapFailedAction, validateSwapPercentText, buildTrackerPath, computeNextChatNumber, updateTrackerWithNextChatNumber, openTrackerOfPane, resetTrackerAfterFailedSwap } = await import("./singleChat.ts");
const { buildDirectorPaneCommand } = await import("../teamSession/teamCommand.ts");

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
  // Scenario: a session name, a chat number, a model, a work folder and an empty swap percent.
  // Step: build the flags. Check that each of the four values has its own -e pair and the empty swap percent adds none.
  // assert.deepEqual(buildSingleChatEnvironmentFlags("bed", 2, "haiku", "/w"), ["-e", "CLAUDE_TMUX_NAME=bed", "-e", "CLAUDE_TMUX_CHAT_NUMBER=2", "-e", "CLAUDE_TMUX_MODEL=haiku", "-e", "CLAUDE_TMUX_WORK_DIRECTORY=/w"]);
  assert.deepEqual(buildSingleChatEnvironmentFlags("bed", 2, "haiku", "/w", ""), ["-e", "CLAUDE_TMUX_NAME=bed", "-e", "CLAUDE_TMUX_CHAT_NUMBER=2", "-e", "CLAUDE_TMUX_MODEL=haiku", "-e", "CLAUDE_TMUX_WORK_DIRECTORY=/w"]);
});

test("test_buildSingleChatEnvironmentFlags_adds_the_swap_percent_when_given", () => {
  // Scenario: a session name, a chat number, a model, a work folder and the swap percent "5".
  // Step: build the flags. Check that the four pairs come first and the swap percent pair comes last.
  assert.deepEqual(buildSingleChatEnvironmentFlags("bed", 2, "haiku", "/w", "5"), ["-e", "CLAUDE_TMUX_NAME=bed", "-e", "CLAUDE_TMUX_CHAT_NUMBER=2", "-e", "CLAUDE_TMUX_MODEL=haiku", "-e", "CLAUDE_TMUX_WORK_DIRECTORY=/w", "-e", "CLAUDE_TMUX_SWAP_PERCENT=5"]);
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

// isTmuxSessionNameTaken reaches tmux_lib.run, which needs Bun, so it runs in a child process.
function runIsTmuxSessionNameTaken(sessionName: string) {
  const code = `const { isTmuxSessionNameTaken } = await import("./claude-tmux/individualSession/singleChat.ts"); console.log(JSON.stringify(isTmuxSessionNameTaken(${JSON.stringify(sessionName)})));`;
  return spawnSync("bun", ["-e", code], { encoding: "utf8", env: { ...process.env, BUN_JSC_useTailCalls: "0" }, cwd: join(import.meta.dirname, "..", "..") });
}

test("test_isTmuxSessionNameTaken_false_when_only_a_longer_name_exists", (t) => {
  // Scenario: only the session "singleChat-test-PID-2" exists. The name "singleChat-test-PID" is a prefix of it.
  // Step 1: start the session with the longer name. Kill it after the test.
  const longerName = `singleChat-test-${process.pid}-2`;
  const newSession = spawnSync("tmux", ["new-session", "-d", "-s", longerName, "sleep", "60"], { encoding: "utf8" });
  assert.equal(newSession.status, 0, newSession.stderr);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${longerName}`]);
  });
  // Step 2: ask if the shorter name is taken, in a Bun child process.
  const child = runIsTmuxSessionNameTaken(`singleChat-test-${process.pid}`);
  // Step 3: check that the child worked and printed false.
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "false");
});

test("test_isTmuxSessionNameTaken_true_for_the_exact_name", (t) => {
  // Scenario: the session "singleChat-test-PID-exact" exists.
  // Step 1: start the session. Kill it after the test.
  const exactName = `singleChat-test-${process.pid}-exact`;
  const newSession = spawnSync("tmux", ["new-session", "-d", "-s", exactName, "sleep", "60"], { encoding: "utf8" });
  assert.equal(newSession.status, 0, newSession.stderr);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${exactName}`]);
  });
  // Step 2: ask if the exact name is taken, in a Bun child process.
  const child = runIsTmuxSessionNameTaken(exactName);
  // Step 3: check that the child worked and printed true.
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "true");
});

test("test_validateSwapPercentText_accepts_a_missing_value", () => {
  // Scenario: the swap percent is not set.
  // Step: validate undefined. Check that it does not throw.
  assert.doesNotThrow(() => validateSwapPercentText(undefined));
});

test("test_validateSwapPercentText_accepts_1", () => {
  // Scenario: the swap percent is the lowest allowed number.
  // Step: validate "1". Check that it does not throw.
  assert.doesNotThrow(() => validateSwapPercentText("1"));
});

test("test_validateSwapPercentText_accepts_100", () => {
  // Scenario: the swap percent is the highest allowed number.
  // Step: validate "100". Check that it does not throw.
  assert.doesNotThrow(() => validateSwapPercentText("100"));
});

test("test_validateSwapPercentText_rejects_abc", () => {
  // Scenario: the swap percent is not a number.
  // Step: validate "abc". Check that it throws the swap percent error.
  assert.throws(() => validateSwapPercentText("abc"), /CLAUDE_TMUX_SWAP_PERCENT/);
});

test("test_validateSwapPercentText_rejects_0", () => {
  // Scenario: the swap percent is below the lowest allowed number.
  // Step: validate "0". Check that it throws the swap percent error.
  assert.throws(() => validateSwapPercentText("0"), /CLAUDE_TMUX_SWAP_PERCENT/);
});

test("test_validateSwapPercentText_rejects_101", () => {
  // Scenario: the swap percent is above the highest allowed number.
  // Step: validate "101". Check that it throws the swap percent error.
  assert.throws(() => validateSwapPercentText("101"), /CLAUDE_TMUX_SWAP_PERCENT/);
});

test("test_validateSwapPercentText_rejects_2_point_5", () => {
  // Scenario: the swap percent is not a whole number.
  // Step: validate "2.5". Check that it throws the swap percent error.
  assert.throws(() => validateSwapPercentText("2.5"), /CLAUDE_TMUX_SWAP_PERCENT/);
});

test("test_validateSwapPercentText_rejects_an_empty_value", () => {
  // Scenario: the swap percent is an empty text.
  // Step: validate "". Check that it throws the swap percent error.
  assert.throws(() => validateSwapPercentText(""), /CLAUDE_TMUX_SWAP_PERCENT/);
});

test("test_computeNextChatNumber_is_one_for_a_new_counter", () => {
  // Scenario: the counter name has no stored number.
  // Step: compute the next number. Check that it is 1.
  assert.equal(computeNextChatNumber({}, "bed helper", 0), 1);
});

test("test_computeNextChatNumber_is_stored_number_plus_one", () => {
  // Scenario: the counter name has a stored number of 3.
  // Step: compute the next number. Check that it is 4.
  assert.equal(computeNextChatNumber({ "bed": 2, "bed helper": 3 }, "bed helper", 0), 4);
});

test("test_computeNextChatNumber_uses_own_number_when_it_is_higher", () => {
  // Scenario: a session that started before the tracker existed has chat number 3 and no stored number.
  // Step: compute the next number. Check that it is 4.
  assert.equal(computeNextChatNumber({}, "bed", 3), 4);
});

test("test_computeNextChatNumber_uses_stored_number_when_it_is_higher", () => {
  // Scenario: the stored number is 5 and the own chat number is 2.
  // Step: compute the next number. Check that it is 6.
  assert.equal(computeNextChatNumber({ "bed": 5 }, "bed", 2), 6);
});

test("test_buildTrackerPath_puts_the_file_in_the_tmux_sessions_folder", () => {
  // Scenario: a project root and a tmux session id.
  // Step: build the tracker path. Check that it is inside the tmux-sessions folder and named for the session id.
  assert.equal(buildTrackerPath("/p", "$241"), "/p/.claude_hooks/tmux-sessions/$241.json");
});

test("test_updateTrackerWithNextChatNumber_writes_and_returns_the_next_number", () => {
  // Scenario: a tracker file holds {"bed helper": 1}.
  // Step 1: make the temp folder and the tracker file.
  const trackerFolder = mkdtempSync(join(tmpdir(), "claude-tmux-tracker-"));
  const trackerPath = join(trackerFolder, "tracker.json");
  writeFileSync(trackerPath, JSON.stringify({ "bed helper": 1 }));
  // Step 2: update the tracker for "bed helper" with own chat number 0. Check that it returns 2.
  assert.equal(updateTrackerWithNextChatNumber(trackerPath, "bed helper", 0), 2);
  // Step 3: check that the file holds {"bed helper": 2}.
  assert.deepEqual(JSON.parse(readFileSync(trackerPath, "utf8")), { "bed helper": 2 });
  // Step 4: check that the lock folder is gone.
  assert.equal(existsSync(`${trackerPath}.lock`), false);
});

test("test_resetTrackerAfterFailedSwap_gives_back_the_number_of_the_failed_chat", () => {
  // Scenario: a tracker file holds {"bed": 3, "bed helper": 2} and the swap of "bed 3" failed.
  // Step 1: make the temp folder and the tracker file.
  const trackerFolder = mkdtempSync(join(tmpdir(), "claude-tmux-tracker-"));
  const trackerPath = join(trackerFolder, "tracker.json");
  writeFileSync(trackerPath, JSON.stringify({ "bed": 3, "bed helper": 2 }));
  // Step 2: reset the tracker for counter "bed" and failed chat "bed 3".
  resetTrackerAfterFailedSwap(trackerPath, "bed", "bed 3");
  // Step 3: check that the file holds {"bed": 2, "bed helper": 2}.
  assert.deepEqual(JSON.parse(readFileSync(trackerPath, "utf8")), { "bed": 2, "bed helper": 2 });
});

test("test_resetTrackerAfterFailedSwap_keeps_a_higher_number_of_a_later_chat", () => {
  // Scenario: a tracker file holds {"bed helper": 4} and the swap of "bed helper 3" failed after a later chat took 4.
  // Step 1: make the temp folder and the tracker file.
  const trackerFolder = mkdtempSync(join(tmpdir(), "claude-tmux-tracker-"));
  const trackerPath = join(trackerFolder, "tracker.json");
  writeFileSync(trackerPath, JSON.stringify({ "bed helper": 4 }));
  // Step 2: reset the tracker for counter "bed helper" and failed chat "bed helper 3".
  resetTrackerAfterFailedSwap(trackerPath, "bed helper", "bed helper 3");
  // Step 3: check that the file still holds {"bed helper": 4}.
  assert.deepEqual(JSON.parse(readFileSync(trackerPath, "utf8")), { "bed helper": 4 });
});

test("test_resetTrackerAfterFailedSwap_removes_its_lock", () => {
  // Scenario: a tracker file holds {"bed": 3} and the swap of "bed 3" failed.
  // Step 1: make the temp folder and the tracker file.
  const trackerFolder = mkdtempSync(join(tmpdir(), "claude-tmux-tracker-"));
  const trackerPath = join(trackerFolder, "tracker.json");
  writeFileSync(trackerPath, JSON.stringify({ "bed": 3 }));
  // Step 2: reset the tracker for counter "bed" and failed chat "bed 3".
  resetTrackerAfterFailedSwap(trackerPath, "bed", "bed 3");
  // Step 3: check that the lock folder is gone.
  assert.equal(existsSync(`${trackerPath}.lock`), false);
});

function runTrackerWriterProcess(trackerPath: string): Promise<{ exitCode: number | null; stdout: string }> {
  const code = `import { updateTrackerWithNextChatNumber } from "${import.meta.dirname}/singleChat.ts"; const numbers = []; for (let index = 0; index < 20; index++) { numbers.push(updateTrackerWithNextChatNumber(${JSON.stringify(trackerPath)}, "bed helper", 0)); } console.log(JSON.stringify(numbers));`;
  const childProcess = spawn("bun", ["-e", code], { env: { ...process.env, BUN_JSC_useTailCalls: "0" } });
  return new Promise((resolve) => {
    let stdout = "";
    childProcess.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    childProcess.on("close", (exitCode) => {
      resolve({ exitCode, stdout });
    });
  });
}

test("test_updateTrackerWithNextChatNumber_gives_different_numbers_to_two_writers_at_once", async () => {
  // Scenario: two processes each take 20 numbers from the same tracker file at the same time.
  // Step 1: make the temp folder and an empty tracker file.
  const trackerFolder = mkdtempSync(join(tmpdir(), "claude-tmux-tracker-"));
  const trackerPath = join(trackerFolder, "tracker.json");
  writeFileSync(trackerPath, "{}");
  // Step 2: start both processes at the same time and wait for both to close.
  const [firstResult, secondResult] = await Promise.all([runTrackerWriterProcess(trackerPath), runTrackerWriterProcess(trackerPath)]);
  // Step 3: check that both processes exit with 0.
  assert.equal(firstResult.exitCode, 0);
  assert.equal(secondResult.exitCode, 0);
  // Step 4: check that the 40 numbers are exactly 1 to 40, so no number was given twice.
  const allNumbers: number[] = [...JSON.parse(firstResult.stdout), ...JSON.parse(secondResult.stdout)];
  allNumbers.sort((left, right) => left - right);
  const expectedNumbers: number[] = [];
  for (let number = 1; number <= 40; number++) {
    expectedNumbers.push(number);
  }
  assert.deepEqual(allNumbers, expectedNumbers);
});

function startTrackerTestSession(t: { after: (hook: () => void) => void }, caseName: string): { pane: string; sessionName: string } {
  const sessionName = `tracker-test-${process.pid}-${caseName}`;
  const startResult = spawnSync("tmux", ["new-session", "-d", "-P", "-F", "#{pane_id}", "-s", sessionName, "sleep", "60"], { encoding: "utf8" });
  assert.equal(startResult.status, 0);
  t.after(() => {
    spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  });
  return { pane: startResult.stdout.trim(), sessionName };
}

function removeGlobalHooksOfFolder(folder: string): void {
  while (true) {
    const hookLines = spawnSync("tmux", ["show-hooks", "-g"], { encoding: "utf8" }).stdout.split("\n");
    let matchingLine = "";
    for (const hookLine of hookLines) {
      if (hookLine.includes(folder)) {
        matchingLine = hookLine;
        break;
      }
    }
    if (matchingLine === "") {
      return;
    }
    const index = /session-closed\[(\d+)\]/.exec(matchingLine)![1];
    spawnSync("tmux", ["set-hook", "-gu", `session-closed[${index}]`]);
  }
}

function countGlobalHookLinesOfFolder(folder: string): number {
  const hookLines = spawnSync("tmux", ["show-hooks", "-g"], { encoding: "utf8" }).stdout.split("\n");
  let matchingLineCount = 0;
  for (const hookLine of hookLines) {
    if (hookLine.includes(folder)) {
      matchingLineCount++;
    }
  }
  return matchingLineCount;
}

test("test_openTrackerOfPane_creates_an_empty_tracker_in_the_project_folder", (t) => {
  // Scenario: a tmux session has no tracker yet.
  // Step 1: make the project folder and the tmux session.
  const projectFolder = mkdtempSync(join(tmpdir(), "claude-tmux-project-"));
  t.after(() => removeGlobalHooksOfFolder(projectFolder));
  const { pane } = startTrackerTestSession(t, "creates");
  // Step 2: open the tracker of the pane.
  const trackerPath = openTrackerOfPane(pane, projectFolder);
  // Step 3: check that the path is in the tmux-sessions folder and ends with .json.
  assert.ok(trackerPath.startsWith(`${projectFolder}/.claude_hooks/tmux-sessions/`));
  assert.ok(trackerPath.endsWith(".json"));
  // Step 4: check that the file holds {}.
  assert.deepEqual(JSON.parse(readFileSync(trackerPath, "utf8")), {});
});

test("test_openTrackerOfPane_returns_the_same_tracker_on_a_second_call", (t) => {
  // Scenario: the tracker of a session is already open.
  // Step 1: make the project folder and the tmux session.
  const projectFolder = mkdtempSync(join(tmpdir(), "claude-tmux-project-"));
  t.after(() => removeGlobalHooksOfFolder(projectFolder));
  const { pane } = startTrackerTestSession(t, "second");
  // Step 2: open the tracker twice for the same pane.
  const firstPath = openTrackerOfPane(pane, projectFolder);
  const secondPath = openTrackerOfPane(pane, projectFolder);
  // Step 3: check that both paths are equal.
  assert.equal(secondPath, firstPath);
});

test("test_openTrackerOfPane_tracker_is_removed_when_the_tmux_session_ends", (t) => {
  // Scenario: a tmux session has a tracker file.
  // Step 1: make the project folder and the tmux session.
  const projectFolder = mkdtempSync(join(tmpdir(), "claude-tmux-project-"));
  t.after(() => removeGlobalHooksOfFolder(projectFolder));
  const { pane, sessionName } = startTrackerTestSession(t, "removed");
  // Step 2: open the tracker and check that the file exists.
  const trackerPath = openTrackerOfPane(pane, projectFolder);
  assert.equal(existsSync(trackerPath), true);
  // Step 3: end the tmux session and wait one second for the hook.
  spawnSync("tmux", ["kill-session", "-t", `=${sessionName}`]);
  spawnSync("sleep", ["1"]);
  // Step 4: check that the file is gone.
  assert.equal(existsSync(trackerPath), false);
});

test("test_openTrackerOfPane_adds_one_cleanup_hook_for_two_sessions_in_one_folder", (t) => {
  // Scenario: two tmux sessions use the same project folder.
  // Step 1: make the project folder and both tmux sessions.
  const projectFolder = mkdtempSync(join(tmpdir(), "claude-tmux-project-"));
  t.after(() => removeGlobalHooksOfFolder(projectFolder));
  const firstSession = startTrackerTestSession(t, "hookone");
  const secondSession = startTrackerTestSession(t, "hooktwo");
  // Step 2: open the tracker of each pane.
  openTrackerOfPane(firstSession.pane, projectFolder);
  openTrackerOfPane(secondSession.pane, projectFolder);
  // Step 3: check that the global hooks hold exactly one line for the project folder.
  assert.equal(countGlobalHookLinesOfFolder(projectFolder), 1);
});
