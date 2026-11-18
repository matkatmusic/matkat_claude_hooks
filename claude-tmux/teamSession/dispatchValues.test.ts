import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const dispatchSettings = JSON.parse(readFileSync(`${import.meta.dirname}/../../dispatcher/dispatch.json`, "utf8"));
const teamValues: Record<string, string | string[]> = dispatchSettings.values["claude-tmux-team"];

test("test_sendInstructions_do_not_say_a_chat_starts_at_the_first_message", () => {
  // Scenario: claude-tmux team starts all chats at once, so the send instructions must not say a chat starts at the first message.
  // Step: join the send instructions. Check that the old line is gone.
  const sendInstructions = [teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_SEND_INSTRUCTIONS"]].flat().join("\n");
  assert.equal(sendInstructions.includes("The chat for a job starts the first time a message is sent to that job."), false);
});

const { buildJobValueKey } = await import("./teamFile.ts");
const roleModels: Record<string, string> = { "Read-Find-orchestrator": "sonnet", "Planner": "sonnet", "PlanReviewer": "opus", "PlanAuditor": "opus", "Build-orchestrator": "opus" };
const joinValue = (valueKey: string): string => [teamValues[valueKey]].flat().join("\n");

test("test_teamValues_name_the_five_roles_of_the_drawing", () => {
  // Scenario: the roles of the team use the names of the user's drawing.
  // Step: read the director role and the role list. Check both.
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB"], "Director");
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"], Object.keys(roleModels).join(","));
});

test("test_teamValues_have_model_and_prompt_for_each_role", () => {
  // Scenario: each role has its own model and prompt value.
  // Step: for each role, read the model value and check that the prompt value exists. Check the model.
  for (const [role, model] of Object.entries(roleModels)) {
    assert.equal(teamValues[buildJobValueKey(role, "MODEL")], model);
    assert.notEqual(teamValues[buildJobValueKey(role, "PROMPT")], undefined);
  }
});

test("test_dispatch_json_gives_the_teamleader_job_the_opus_model", () => {
  // Scenario: the TeamLeader chat has its own model value and does not copy the Director.
  // Step: read the TeamLeader job name from its value. Check that the model value of that job is opus.
  const teamLeaderJob = teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"] as string;
  assert.equal(teamValues[buildJobValueKey(teamLeaderJob, "MODEL")], "opus");
});

test("test_teamValues_have_no_keys_of_the_old_job_names", () => {
  // Scenario: the old job names are gone.
  // Step: collect the keys that hold an old job name. The list must be empty.
  const oldKeys = Object.keys(teamValues).filter((valueKey) => /READERS|VERIFIER|ADVERSARY|(^|_)BUILDER_(MODEL|PROMPT)/.test(valueKey));
  assert.deepEqual(oldKeys, []);
});

test("test_teamValues_have_team_and_round_limits", () => {
  // Scenario: the limits fill the text of the Director.
  // Step: read both limits. Check that the team limit is 2 and the round limit is 3.
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_MAX_TEAMS"], "2");
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_MAX_REVIEW_ROUNDS"], "3");
});

test("test_teamValues_hold_one_line_in_each_string", () => {
  // Scenario: an array value has one string for each line.
  // Step: collect the strings that hold a line break. The list must be empty.
  const stringsWithLineBreak: string[] = [];
  for (const value of Object.values(teamValues)) {
    for (const line of [value].flat()) {
      if (line.includes("\n"))
        stringsWithLineBreak.push(line);
    }
  }
  assert.deepEqual(stringsWithLineBreak, []);
});

test("test_texts_use_only_fields_that_the_scripts_give", () => {
  // Scenario: fillTemplate throws on a field that the scripts do not give.
  // Step 1: list the fields that the scripts give to each text.
  const fieldsOfText: Record<string, string[]> = {
    DIRECTOR_START_PROMPT: ["leadScript", "jobTeamScript", "closeTeamScript", "maxTeams", "readFindHandle"],
    TEAMLEADER_PROMPT: ["maxRounds", "userQuestionRule"],
    TEAMLEADER_QUESTION_RULE_MODE_1: [],
    TEAMLEADER_QUESTION_RULE_MODE_2: ["directorHandle"],
    READ_FIND_ORCHESTRATOR_PROMPT: [],
    PLANNER_PROMPT: [],
    PLANREVIEWER_PROMPT: [],
    PLANAUDITOR_PROMPT: [],
    BUILD_ORCHESTRATOR_PROMPT: [],
    JOB_HEADER: [],
    HANDLE_LIST_HEADER: [],
    HANDLE_LINE: ["chatName", "role"],
    WORKTREE_TEXT: ["worktreePath", "branch", "baseBranch"],
    TAKEOVER_PROMPT: ["oldHandle", "handoffPath", "closeScript", "job", "logPath"],
    LEAVING_NOTICE: ["newHandle"],
    REPLACED_NOTICE: ["oldHandle", "newHandle"],
  };
  // Step 2: for each text, collect the placeholders that are not in its fields. The list must be empty.
  const unknownPlaceholders: string[] = [];
  for (const [valueKey, fields] of Object.entries(fieldsOfText)) {
    assert.notEqual(teamValues[`CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_${valueKey}`], undefined, valueKey);
    for (const placeholder of joinValue(`CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_${valueKey}`).matchAll(/\{(\w+)\}/g)) {
      if (!fields.includes(placeholder[1]))
        unknownPlaceholders.push(`${valueKey} ${placeholder[1]}`);
    }
  }
  assert.deepEqual(unknownPlaceholders, []);
});

test("test_directorStartPrompt_names_both_scripts_and_the_team_limit", () => {
  // Scenario: the Director chooses between Mode 1 and Mode 2 and needs the exact commands.
  // Step: read the text. Check the two commands and the limit placeholder.
  const directorStartPrompt = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_START_PROMPT");
  assert.ok(directorStartPrompt.includes('bun {leadScript} "JOB-TEXT"'));
  assert.ok(directorStartPrompt.includes('bun {jobTeamScript} "JOB-NAME" "JOB-TEXT"'));
  assert.ok(directorStartPrompt.includes("{maxTeams}"));
  assert.ok(directorStartPrompt.includes("{readFindHandle}"));
});

test("test_director_start_prompt_holds_the_close_team_command", () => {
  // Scenario: the Director closes a job team with an exact command.
  // Step: read the text. Check the close command.
  const directorStartPrompt = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_START_PROMPT");
  assert.ok(directorStartPrompt.includes('bun {closeTeamScript} "JOB-NAME"'));
});

test("test_teamValues_name_the_read_find_job", () => {
  // Scenario: the Director needs the name of the Read-Find job to reach it.
  // Step: read the Read-Find job value and the job list. Check the name and that the list holds it.
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_READ_FIND_JOB"], "Read-Find-orchestrator");
  assert.ok(String(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"]).split(",").includes("Read-Find-orchestrator"));
});

test("test_teamLeaderPrompt_has_seven_steps_and_the_send_message_rule", () => {
  // Scenario: the TeamLeader runs the seven steps and messages with SendMessage.
  // Step: read the text. Check step 7, the round limit, the SendMessage tool and the question rule placeholder.
  const teamLeaderPrompt = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_PROMPT");
  assert.ok(teamLeaderPrompt.includes("\n7. "));
  assert.ok(teamLeaderPrompt.includes("{maxRounds}"));
  assert.ok(teamLeaderPrompt.includes("SendMessage"));
  assert.ok(teamLeaderPrompt.includes("{userQuestionRule}"));
});

test("test_helper_role_prompts_use_send_message_and_send_questions_to_the_team_leader", () => {
  // Scenario: each helper messages with SendMessage and does not ask the user.
  // Step: for each role, read the prompt. Check both rules.
  for (const role of Object.keys(roleModels)) {
    const rolePrompt = joinValue(buildJobValueKey(role, "PROMPT"));
    assert.ok(rolePrompt.includes("SendMessage"), role);
    assert.ok(rolePrompt.includes("Do not ask the user. Send your questions to the TeamLeader."), role);
  }
});

test("test_replacedNotice_and_handleLine_have_the_given_shape", () => {
  // Scenario: the notice text and the handle line are fixed by the user.
  // Step: read both values. Check the exact text.
  assert.equal(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_REPLACED_NOTICE"), "[claude-tmux-team] {newHandle} replaces {oldHandle}. Use the ListAgents tool to check chat names. No task to track this swap is necessary. No reply is necessary.");
  assert.equal(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDLE_LINE"), '- @"{chatName}": {role}');
});

test("test_leavingNotice_tells_the_old_chat_to_pass_on_messages", () => {
  // Scenario: a message can still reach the old chat while the handoff runs.
  // Step: read the notice. Check the pass-on sentence.
  assert.ok(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_LEAVING_NOTICE").includes("Pass on to {newHandle} any message that still reaches you."));
});

test("test_leavingNotice_has_the_prefix_and_the_list_agents_and_no_task_sentences", () => {
  // Scenario: the old chat checks chat names and makes no task for the swap.
  // Step: read the notice. Check the prefix and both sentences.
  const leavingNotice = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_LEAVING_NOTICE");
  assert.ok(leavingNotice.startsWith("[claude-tmux-team] "));
  assert.ok(leavingNotice.includes("Use the ListAgents tool to check chat names. Do not create a task for this replacement."));
});

test("test_takeoverPrompt_tells_the_new_chat_to_check_chat_names_and_make_no_task", () => {
  // Scenario: the new chat checks chat names and makes no task for the swap.
  // Step: read the prompt lines. Check both lines.
  const takeoverPromptLines = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TAKEOVER_PROMPT").split("\n");
  assert.ok(takeoverPromptLines.includes("Use the ListAgents tool to check chat names."));
  assert.ok(takeoverPromptLines.includes("Do not create a task for this replacement."));
});

test("test_prompts_do_not_name_the_send_script", () => {
  // Scenario: chats message each other with SendMessage, not with sendToJob.
  // Step: join the texts that the scripts build. Check that none names sendToJob or the old send placeholder.
  const keys = ["DIRECTOR_START_PROMPT", "TEAMLEADER_PROMPT", "TAKEOVER_PROMPT", "LEAVING_NOTICE", "WORKTREE_TEXT", ...Object.keys(roleModels).map((role) => buildJobValueKey(role, "PROMPT").replace("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_", ""))];
  for (const key of keys) {
    const text = joinValue(`CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_${key}`);
    assert.equal(/sendToJob|sendScript/.test(text), false, key);
  }
});

test("test_worktree_values_are_set", () => {
  // Scenario: the worktree folder and the setup command come from values.
  // Step: read both values. Check the text.
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_WORKTREE_DIRECTORY"], ".claude/worktrees");
  assert.equal(joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_WORKTREE_SETUP_COMMANDS"), "git submodule update --init --recursive");
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB"], "TeamLeader");
});

test("test_teamValues_set_the_window_layout", () => {
  // Scenario: the panes of a team window sit side by side.
  // Step: read the layout value. Check the layout name.
  // PANES_PER_WINDOW is no longer used: HELPER_WINDOWS replaces it.
  // assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_PANES_PER_WINDOW"], "3");
  assert.equal(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_WINDOW_LAYOUT"], "even-horizontal");
});

test("test_teamValues_put_each_helper_role_in_one_window", () => {
  // Scenario: each string of the value is one tmux window and holds one role name.
  // Step 1: read the value. Check that it has one window for each role and that no window line holds a comma.
  const helperWindows = [teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HELPER_WINDOWS"]].flat();
  // One chat for each window replaces the two window groups.
  // assert.equal(helperWindows.length, 2);
  // assert.equal(helperWindows[0], "Read-Find-orchestrator,Planner,PlanReviewer");
  // assert.equal(helperWindows[1], "PlanAuditor,Build-orchestrator");
  assert.equal(helperWindows.length, String(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"]).split(",").length);
  for (const helperWindow of helperWindows) {
    assert.equal(helperWindow.includes(","), false, helperWindow);
  }
  // Step 2: join the windows in order. The role names must equal the job list, so each role is in one window.
  assert.deepEqual(helperWindows.join(",").split(","), String(teamValues["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"]).split(","));
});

test("test_teamValues_have_no_angle_brackets", () => {
  // Scenario: a shell hook blocks a copied command that holds "<" or ">".
  // Step: check every claude-tmux team value. Collect the values that hold an angle bracket. The list must be empty.
  const valueKeysWithAngleBrackets: string[] = [];
  for (const [valueKey, value] of Object.entries(teamValues)) {
    const valueText = [value].flat().join("\n");
    if (/[<>]/.test(valueText))
      valueKeysWithAngleBrackets.push(valueKey);
  }
  assert.deepEqual(valueKeysWithAngleBrackets, []);
});

test("test_teamValues_handoff_command_tells_no_session_id", () => {
  // Scenario: the team swap sends the handoff command to the old chat; it must not tell the chat its session id.
  // Step: join the team handoff command. Check that it holds no session id field.
  const handoffCommand = joinValue("CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDOFF_COMMAND");
  // assert.equal(/\{\w+\}/.test(handoffCommand), false);
  assert.equal(handoffCommand.includes("{sessionId}"), false);
});
