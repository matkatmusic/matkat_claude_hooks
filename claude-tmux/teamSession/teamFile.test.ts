import { test } from "node:test";
import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Team, TeamChat } from "./teamFile.ts";

const {
  buildTeamFilePath,
  findChatWithStatus,
  // fillTemplate,
  buildJobValueKey,
  // hasOpenDialog,
  // isChatBusy,
  // isInputBoxEmpty,
  buildPaneEnvironmentFlags,
  readTeamFile,
  writeTeamFile,
  lockTeamFile,
  unlockTeamFile,
  // inputBoxHoldsMessage,
  addReplacementChat,
  undoReplacementChat,
  // listHandoffFiles,
  // findNewHandoffFile,
  parseSendTarget,
  removeChat,
  buildJobChatFields,
  buildMessageWithRoleText,
  listNoticeChats,
  listReplacedNoticeChats,
  buildHandle,
  findTeamLeader,
  markDirectorAsTeamLeader,
  buildHandleList,
  countLiveJobTeams,
  listIdleStateDirectories,
  findDirectorChatOfJobTeam,
  // hasBackgroundWorkDialog,
  getReplacementChatModel,
  buildTranscriptDirectory,
  findSessionIdOfChat,
  listChatsInSwap,
  findPlanAuditorToWaitFor,
} = await import("./teamFile.ts");

const { hasOpenDialog, inputBoxHoldsMessage, isChatBusy, isInputBoxEmpty, hasBackgroundWorkDialog } = await import("../shared/chatScreen.ts");

const { fillTemplate, listHandoffFiles, findNewHandoffFile } = await import("../shared/chatSwap.ts");

const sampleTeam = {
  teamName: "feature X",
  workDirectory: "/w",
  chats: [{ job: "planner", chatNumber: 1, chatName: "feature X planner 1", pane: "%1", model: "sonnet", status: "active" as const }],
};

test("test_buildTeamFilePath_encodes_team_name", () => {
  // Scenario: the team name becomes a safe file name.
  // Step: build the path for "feature X/1". Check the exact path.
  assert.equal(buildTeamFilePath("/s", "feature X/1"), "/s/claude-tmux-team/feature%20X%2F1.json");
});

test("test_findChatWithStatus_returns_matching_chat", () => {
  // Scenario: job and status both match.
  // Step: look for the active planner. Check that the planner chat comes back.
  assert.equal(findChatWithStatus(sampleTeam, "planner", "active")?.chatName, "feature X planner 1");
});

test("test_findChatWithStatus_returns_undefined_for_other_status", () => {
  // Scenario: the job matches but the status does not.
  // Step: look for the starting planner. Check for undefined.
  assert.equal(findChatWithStatus(sampleTeam, "planner", "starting"), undefined);
});

test("test_fillTemplate_replaces_two_keys", () => {
  // Scenario: two different keys.
  // Step: fill "{a} and {b}". Check the text.
  assert.equal(fillTemplate("{a} and {b}", { a: "1", b: "2" }), "1 and 2");
});

test("test_fillTemplate_replaces_same_key_twice", () => {
  // Scenario: one key twice.
  // Step: fill "{a}{a}". Check the text.
  assert.equal(fillTemplate("{a}{a}", { a: "1" }), "11");
});

test("test_fillTemplate_throws_on_missing_key", () => {
  // Scenario: the template has a key that fields do not have.
  // Step: fill "{a}{b}" with only a. Check that it throws.
  assert.throws(() => fillTemplate("{a}{b}", { a: "1" }));
});

test("test_listIdleStateDirectories_returns_the_project_folder_when_the_team_has_no_worktree", () => {
  // Scenario: the team has no worktree.
  // Step: list the idle state folders for project "/p". Check that only the project folder comes back.
  assert.deepEqual(listIdleStateDirectories(sampleTeam, "/p"), ["/p/.idleState"]);
});

test("test_listIdleStateDirectories_adds_the_worktree_folder_of_the_team", () => {
  // Scenario: the team has a worktree that is not the project root.
  // Step: list the idle state folders for project "/p" and worktree "/wt". Check that both folders come back, project first.
  const team: Team = { ...sampleTeam, worktreePath: "/wt" };
  assert.deepEqual(listIdleStateDirectories(team, "/p"), ["/p/.idleState", "/wt/.idleState"]);
});

test("test_listIdleStateDirectories_gives_one_folder_when_the_worktree_is_the_project_root", () => {
  // Scenario: the worktree path equals the project root.
  // Step: list the idle state folders for project "/p" and worktree "/p". Check that the folder is not listed twice.
  const team: Team = { ...sampleTeam, worktreePath: "/p" };
  assert.deepEqual(listIdleStateDirectories(team, "/p"), ["/p/.idleState"]);
});

test("test_buildJobValueKey_uses_capitals", () => {
  // Scenario: the job name goes into a settings key.
  // Step: build the model key for planner. Check the key.
  assert.equal(buildJobValueKey("planner", "MODEL"), "CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_PLANNER_MODEL");
});

test("test_buildJobValueKey_turns_hyphen_into_underscore", () => {
  // Scenario: the role name has a hyphen, which is not valid in a settings key.
  // Step: build the model key for Read-Find-orchestrator. Check that the hyphens are underscores.
  assert.equal(buildJobValueKey("Read-Find-orchestrator", "MODEL"), "CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_READ_FIND_ORCHESTRATOR_MODEL");
});

test("test_buildJobValueKey_keeps_capital_names_in_one_word", () => {
  // Scenario: the role name has capitals in the middle and no hyphen.
  // Step: build the prompt key for PlanReviewer. Check that no underscore is added.
  assert.equal(buildJobValueKey("PlanReviewer", "PROMPT"), "CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_PLANREVIEWER_PROMPT");
});

test("test_hasOpenDialog_true_for_dialog_text", () => {
  // Scenario: the screen shows "Esc to cancel".
  // Step: check a screen with the text. Check for true.
  assert.equal(hasOpenDialog("Pick one\n  Enter to select · Esc to cancel"), true);
});

test("test_hasOpenDialog_true_for_broken_line", () => {
  // Scenario: a narrow pane breaks the text over two lines.
  // Step: check a screen where one line ends with "Esc to" and the next starts with "cancel". Check for true.
  assert.equal(hasOpenDialog("Enter to select · Esc to\ncancel"), true);
});

test("test_hasOpenDialog_false_without_dialog_text", () => {
  // Scenario: a plain screen.
  // Step: check a screen without the text. Check for false.
  assert.equal(hasOpenDialog("❯ hello"), false);
});

test("test_isChatBusy_true_for_busy_line_with_seconds", () => {
  // Scenario: the chat is in a turn and the busy line shows seconds.
  // Step: check a screen with the busy line and an empty box below it. Check for true.
  const screen = "✽ Waiting for the build to finish before testing… (23s · thinking)\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(isChatBusy(screen), true);
});

test("test_isChatBusy_true_for_busy_line_with_minutes", () => {
  // Scenario: the chat is in a turn and the busy line shows minutes.
  // Step: check a screen with the minutes busy line and an empty box below it. Check for true.
  const screen = "✶ Waiting for the build to finish before testing… (9m 23s)\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(isChatBusy(screen), true);
});

test("test_isChatBusy_false_for_finished_turn_line", () => {
  // Scenario: the turn is over and the screen shows the done line.
  // Step: check a screen with the done line and an empty box. Check for false.
  const screen = "✻ Crunched for 1m 41s · done 12:36 AM\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(isChatBusy(screen), false);
});

test("test_isInputBoxEmpty_true_for_empty_box", () => {
  // Scenario: the last ❯ line holds no text.
  // Step: check a screen with an empty box, a rule line and a status line. Check for true.
  const screen = "some output\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(isInputBoxEmpty(screen), true);
});

test("test_isInputBoxEmpty_false_for_box_with_text", () => {
  // Scenario: the last ❯ line holds typed text that wraps over more lines.
  // Step: check a screen whose box holds the text. Check for false.
  const screen = "some output\n\n──────────\n❯ @\"run jfred roadmap 2 page Planner 2\" replaces you, because you are\n  going to do the work\n──────────\n  ? for shortcuts";
  assert.equal(isInputBoxEmpty(screen), false);
});

test("test_isInputBoxEmpty_true_when_only_an_older_prompt_holds_text", () => {
  // Scenario: an older submitted prompt sits higher on the screen and the box is empty.
  // Step: check a screen with an old ❯ line and an empty last ❯ line. Check for true.
  const screen = "❯ some old prompt\n\n● done\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(isInputBoxEmpty(screen), true);
});

test("test_isInputBoxEmpty_false_for_screen_with_no_box", () => {
  // Scenario: the screen has no ❯ line.
  // Step: check a screen with plain output only. Check for false.
  assert.equal(isInputBoxEmpty("some output\nmore output"), false);
});

test("test_buildPaneEnvironmentFlags_returns_three_pairs", () => {
  // Scenario: each pane gets three variables.
  // Step: build the flags. Check the exact array.
  assert.deepEqual(buildPaneEnvironmentFlags("feature X", "planner", "feature X planner 1"), [
    "-e", "CLAUDE_TMUX_TEAM_NAME=feature X",
    "-e", "CLAUDE_TMUX_TEAM_JOB=planner",
    "-e", "CLAUDE_TMUX_TEAM_CHAT_NAME=feature X planner 1",
  ]);
});

test("test_writeTeamFile_then_readTeamFile_round_trips", () => {
  // Scenario: a team written to disk comes back equal.
  // Steps: write into a new folder. Read it. Compare.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "sub", "t.json");
  writeTeamFile(teamFilePath, sampleTeam);
  assert.deepEqual(readTeamFile(teamFilePath), sampleTeam);
});

test("test_readTeamFile_throws_when_file_missing", () => {
  // Scenario: no team file.
  // Step: read a path that does not exist. Check that it throws.
  assert.throws(() => readTeamFile(join(tmpdir(), "no-such-team-file.json")));
});

test("test_unlockTeamFile_removes_lock_folder", () => {
  // Scenario: unlock removes the lock folder.
  // Steps: lock. Check the folder exists. Unlock. Check the folder is gone.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  lockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), true);
  unlockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), false);
});

test("test_lockTeamFile_takes_stale_lock", () => {
  // Scenario: a lock folder 60 seconds old is left over from a failed script.
  // Steps: make the folder with an old time stamp. Lock. Check that the lock call returns.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  mkdirSync(`${teamFilePath}.lock`);
  const oldSeconds = Date.now() / 1000 - 60;
  utimesSync(`${teamFilePath}.lock`, oldSeconds, oldSeconds);
  lockTeamFile(teamFilePath);
  assert.equal(existsSync(`${teamFilePath}.lock`), true);
});

test("test_lockTeamFile_waits_until_unlock", async () => {
  // Scenario: a second process waits while the first holds the lock.
  // Steps: lock here. Start a second process that locks. Wait 0.5 seconds. Unlock. Check that the second process ended after 0.5 seconds.
  const teamFilePath = join(mkdtempSync(join(tmpdir(), "team-")), "t.json");
  lockTeamFile(teamFilePath);
  const startedAt = Date.now();
  const childCode = `const { lockTeamFile } = await import(${JSON.stringify(new URL("./teamFile.ts", import.meta.url).href)}); lockTeamFile(${JSON.stringify(teamFilePath)});`;
  const child = spawn(process.execPath, ["--input-type=module", "-e", childCode], { stdio: "inherit" });
  const childEnded = new Promise((resolve) => child.on("exit", resolve));
  await new Promise((resolve) => setTimeout(resolve, 500));
  unlockTeamFile(teamFilePath);
  await childEnded;
  assert.ok(Date.now() - startedAt >= 500);
});

test("test_inputBoxHoldsMessage_true_when_last_prompt_line_holds_text", () => {
  // Scenario: the typed text sits in the input box.
  // Step: check a screen whose last ❯ line holds the text start. Check for true.
  assert.equal(inputBoxHoldsMessage("output\n  ❯ hello world this is a long message\n", "hello world this is a long message"), true);
});

test("test_inputBoxHoldsMessage_true_when_last_prompt_line_shows_pasted_text_marker", () => {
  // Scenario: a long text is shown in the input box as a short marker.
  // Step: check a screen whose last ❯ line holds the marker, with a text that is not on the screen. Check for true.
  assert.equal(inputBoxHoldsMessage("output\n❯ [Pasted text +13 lines]\n", "line one of a long message"), true);
});

test("test_inputBoxHoldsMessage_true_when_box_is_scrolled_to_the_end_of_a_long_text", () => {
  // Scenario: a long text scrolls in the input box, so the first ❯ line shows a middle part of the text and the next line holds the end.
  // Step: check a screen whose last ❯ line holds a middle part and whose next line wraps the end of the text. Check for true.
  const text = "[claude-tmux-team] From planner\nplease send the finished plan to the orchestrator job with the send command followed by your message in quotes.";
  assert.equal(inputBoxHoldsMessage("output\n❯ the orchestrator job with the send command\n  followed by your message in\n  quotes.\n-----\n  status line\n", text), true);
});

test("test_inputBoxHoldsMessage_false_for_queued_message", () => {
  // Scenario: the message is queued and the box shows placeholder text.
  // Step: check a screen where an earlier ❯ line has the text and the last ❯ line has a placeholder. Check for false.
  assert.equal(inputBoxHoldsMessage("❯ hello world this is a long message\n❯ Press up to edit queued messages\n", "hello world this is a long message"), false);
});

test("test_inputBoxHoldsMessage_false_without_prompt_line", () => {
  // Scenario: no input box on the screen.
  // Step: check a screen with no ❯ line. Check for false.
  assert.equal(inputBoxHoldsMessage("nothing here", "hello"), false);
});

test("test_addReplacementChat_sets_old_chat_to_leaving", () => {
  // Scenario: the active planner is replaced.
  // Step: add the replacement. Check that the old chat is leaving.
  const team = structuredClone(sampleTeam);
  const { oldChat } = addReplacementChat(team, "planner");
  assert.equal(oldChat.status, "leaving");
  assert.equal(team.chats[0].status, "leaving");
});

test("test_addReplacementChat_adds_chat_with_number_raised_by_one", () => {
  // Scenario: the active planner is chat 1.
  // Step: add the replacement. Check the number, the name, the pane and the status of the new chat.
  const team = structuredClone(sampleTeam);
  const { newChat } = addReplacementChat(team, "planner");
  assert.equal(newChat.chatNumber, 2);
  assert.equal(newChat.chatName, "feature X planner 2");
  assert.equal(newChat.pane, "");
  assert.equal(newChat.status, "starting");
  assert.equal(team.chats[1], newChat);
});

test("test_addReplacementChat_keeps_job_and_model", () => {
  // Scenario: the new chat does the same work as the old chat.
  // Step: add the replacement. Check the job and the model of the new chat.
  const team = structuredClone(sampleTeam);
  const { newChat } = addReplacementChat(team, "planner");
  assert.equal(newChat.job, "planner");
  assert.equal(newChat.model, "sonnet");
});

test("test_addReplacementChat_throws_without_active_chat", () => {
  // Scenario: the job has no active chat.
  // Step: add a replacement for the job readers. Check that it throws.
  const team = structuredClone(sampleTeam);
  assert.throws(() => addReplacementChat(team, "readers"), /job readers has no active chat/);
});

const teamInMiddleOfSwap = {
  teamName: "feature X",
  workDirectory: "/w",
  chats: [
    { job: "planner", chatNumber: 1, chatName: "feature X planner 1", pane: "%1", model: "sonnet", status: "leaving" as const },
    { job: "planner", chatNumber: 2, chatName: "feature X planner 2", pane: "%2", model: "sonnet", status: "starting" as const },
  ],
};

test("test_undoReplacementChat_sets_old_chat_active_again", () => {
  // Scenario: a swap failed.
  // Step: undo the replacement. Check that the old chat is active.
  const team = structuredClone(teamInMiddleOfSwap);
  undoReplacementChat(team, "planner", "feature X planner 1");
  assert.equal(team.chats[0].status, "active");
});

test("test_undoReplacementChat_removes_and_returns_starting_chat", () => {
  // Scenario: a swap failed.
  // Step: undo the replacement. Check the returned chat and the chat list.
  const team = structuredClone(teamInMiddleOfSwap);
  const removedChat = undoReplacementChat(team, "planner", "feature X planner 1");
  assert.equal(removedChat?.chatName, "feature X planner 2");
  assert.equal(team.chats.length, 1);
});

test("test_undoReplacementChat_returns_undefined_without_starting_chat", () => {
  // Scenario: the job has no starting chat.
  // Step: undo the replacement. Check for undefined.
  const team = structuredClone(sampleTeam);
  assert.equal(undoReplacementChat(team, "planner", "feature X planner 1"), undefined);
});

test("test_undoReplacementChat_keeps_old_chat_status_without_starting_chat", () => {
  // Scenario: the job has no starting chat and the old chat is leaving.
  // Step: undo the replacement. Check that the old chat stays leaving.
  const team = structuredClone(teamInMiddleOfSwap);
  team.chats.splice(1, 1);
  undoReplacementChat(team, "planner", "feature X planner 1");
  assert.equal(team.chats[0].status, "leaving");
});

test("test_undoReplacementChat_keeps_active_new_chat", () => {
  // Scenario: the new chat is already active.
  // Step: undo the replacement. Check that the new chat stays in the list and the old chat stays leaving.
  const team = structuredClone(teamInMiddleOfSwap);
  team.chats[1].status = "active" as never;
  assert.equal(undoReplacementChat(team, "planner", "feature X planner 1"), undefined);
  assert.equal(team.chats.length, 2);
  assert.equal(team.chats[0].status, "leaving");
});

test("test_listHandoffFiles_returns_only_files_of_the_session", () => {
  // Scenario: the folder holds files of two sessions.
  // Step: list the files of session "abcdef1234567890". Check that only its two files come back, sorted by name.
  const directory = mkdtempSync(join(tmpdir(), "handoff-"));
  writeFileSync(join(directory, "2026-11-15-1000-abcdef12.json"), "{}");
  writeFileSync(join(directory, "2026-11-15-0900-abcdef12.json"), "{}");
  writeFileSync(join(directory, "2026-11-15-1000-99999999.json"), "{}");
  assert.deepEqual(listHandoffFiles(directory, "abcdef1234567890"), [join(directory, "2026-11-15-0900-abcdef12.json"), join(directory, "2026-11-15-1000-abcdef12.json")]);
});

test("test_listHandoffFiles_returns_empty_list_for_missing_folder", () => {
  // Scenario: the folder does not exist.
  // Step: list the files. Check for an empty list.
  assert.deepEqual(listHandoffFiles(join(tmpdir(), "no-such-handoff-folder"), "abcdef1234567890"), []);
});

test("test_findNewHandoffFile_returns_the_new_path", () => {
  // Scenario: one file is new.
  // Step: compare the two lists. Check that the new path comes back.
  assert.equal(findNewHandoffFile(["/a.json"], ["/a.json", "/b.json"]), "/b.json");
});

test("test_findNewHandoffFile_returns_undefined_for_equal_lists", () => {
  // Scenario: no file is new.
  // Step: compare two equal lists. Check for undefined.
  assert.equal(findNewHandoffFile(["/a.json"], ["/a.json"]), undefined);
});

test("test_parseSendTarget_reads_a_plain_job", () => {
  // Scenario: the target is a job name.
  // Step: parse "planner". Check the job and the old-chat flag.
  assert.deepEqual(parseSendTarget("planner"), { job: "planner", isOldChat: false });
});

test("test_parseSendTarget_reads_an_old_chat_target", () => {
  // Scenario: the target starts with old-.
  // Step: parse "old-planner". Check the job and the old-chat flag.
  assert.deepEqual(parseSendTarget("old-planner"), { job: "planner", isOldChat: true });
});

test("test_removeChat_removes_the_chat", () => {
  // Scenario: a chat closed.
  // Step: remove the old planner chat. Check that its name is gone.
  const team = structuredClone(teamInMiddleOfSwap);
  removeChat(team, "feature X planner 1");
  assert.equal(team.chats.some((chat) => chat.chatName === "feature X planner 1"), false);
});

test("test_removeChat_keeps_the_other_chats", () => {
  // Scenario: a chat closed.
  // Step: remove the old planner chat. Check that the new planner chat stays.
  const team = structuredClone(teamInMiddleOfSwap);
  removeChat(team, "feature X planner 1");
  assert.deepEqual(team.chats.map((chat) => chat.chatName), ["feature X planner 2"]);
});

test("test_buildJobChatFields_gives_name_of_active_chat", () => {
  // Scenario: the planner has one active chat.
  // Step: build the fields for the job planner. Check the key and the chat name.
  assert.deepEqual(buildJobChatFields(sampleTeam, ["planner"]), { plannerChat: "feature X planner 1" });
});

test("test_buildJobChatFields_gives_name_of_new_chat_not_leaving_chat", () => {
  // Scenario: the planner was replaced, so chat 1 is leaving and chat 2 is starting.
  // Step: build the fields for the job planner. Check that the name of chat 2 is given.
  assert.deepEqual(buildJobChatFields(teamInMiddleOfSwap, ["planner"]), { plannerChat: "feature X planner 2" });
});

test("test_buildJobChatFields_gives_first_chat_name_for_job_without_chat", () => {
  // Scenario: the team has no Read-Find-orchestrator chat.
  // Step: build the fields for the role Read-Find-orchestrator. Check that the name of chat 1 is given.
  assert.deepEqual(buildJobChatFields(sampleTeam, ["Read-Find-orchestrator"]), { readFindorchestratorChat: "feature X Read-Find-orchestrator 1" });
});

test("test_buildJobChatFields_makes_first_letter_lower_case_and_removes_hyphens", () => {
  // Scenario: the role names of the user's drawing become placeholder keys.
  // Step: build the fields for PlanReviewer and Build-orchestrator. Check the keys.
  assert.deepEqual(Object.keys(buildJobChatFields(sampleTeam, ["PlanReviewer", "Build-orchestrator"])), ["planReviewerChat", "buildorchestratorChat"]);
});

test("test_buildMessageWithRoleText_puts_role_text_in_front_when_needed", () => {
  // Scenario: the chat has not seen its role text.
  // Step: build the message. Check that it starts with the role text, an empty line, and ends with the message.
  const chat = { ...sampleTeam.chats[0], needsRoleText: true };
  assert.equal(buildMessageWithRoleText(chat, "ROLE", "MESSAGE"), "ROLE\n\nMESSAGE");
});

test("test_buildMessageWithRoleText_gives_message_alone_when_false", () => {
  // Scenario: the chat has seen its role text.
  // Step: build the message with needsRoleText false. Check that only the message comes back.
  const chat = { ...sampleTeam.chats[0], needsRoleText: false };
  assert.equal(buildMessageWithRoleText(chat, "ROLE", "MESSAGE"), "MESSAGE");
});

test("test_buildMessageWithRoleText_gives_message_alone_when_missing", () => {
  // Scenario: the chat has no needsRoleText field.
  // Step: build the message. Check that only the message comes back.
  assert.equal(buildMessageWithRoleText(sampleTeam.chats[0], "ROLE", "MESSAGE"), "MESSAGE");
});

const noticeTeam = {
  teamName: "T",
  workDirectory: "/w",
  chats: [
    { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "sonnet", status: "leaving" as const },
    { job: "Director", chatNumber: 2, chatName: "T Director 2", pane: "%2", model: "sonnet", status: "active" as const },
    { job: "Planner", chatNumber: 1, chatName: "T Planner 1", pane: "%3", model: "sonnet", status: "active" as const, needsRoleText: false },
    { job: "PlanAuditor", chatNumber: 1, chatName: "T PlanAuditor 1", pane: "%4", model: "sonnet", status: "active" as const, needsRoleText: true },
  ],
};

function listNoticeChatNames(): string[] {
  const chatNames: string[] = [];
  for (const chat of listNoticeChats(noticeTeam, "T Director 2"))
    chatNames.push(chat.chatName);
  return chatNames;
}

test("test_listNoticeChats_includes_active_chat_that_has_worked", () => {
  // Scenario: an active helper chat has run a turn.
  // Step: list the notice chats for the new chat "T Director 2". Check that "T Planner 1" is in the list.
  assert.ok(listNoticeChatNames().includes("T Planner 1"));
});

test("test_listNoticeChats_leaves_out_the_new_chat", () => {
  // Scenario: the new chat is active too.
  // Step: list the notice chats for "T Director 2". Check that it is not in the list.
  assert.ok(!listNoticeChatNames().includes("T Director 2"));
});

test("test_listNoticeChats_leaves_out_idle_helper_chat", () => {
  // Scenario: an active helper chat has never run a turn (needsRoleText true).
  // Step: list the notice chats. Check that "T PlanAuditor 1" is not in the list.
  assert.ok(!listNoticeChatNames().includes("T PlanAuditor 1"));
});

test("test_listNoticeChats_leaves_out_leaving_chat", () => {
  // Scenario: the old chat has the status leaving.
  // Step: list the notice chats. Check that "T Director 1" is not in the list.
  assert.ok(!listNoticeChatNames().includes("T Director 1"));
});

function buildReplacedChat(teamName: string, job: string, chatNumber: number, extraFields: Partial<TeamChat> = {}): TeamChat {
  return { job, chatNumber, chatName: `${teamName} ${job} ${chatNumber}`, pane: "%1", model: "sonnet", status: "active" as const, needsRoleText: false, ...extraFields };
}

function buildReplacedTeam(teamName: string, chats: TeamChat[]): Team {
  return { teamName, workDirectory: "/w", chats };
}

function listReplacedNoticeChatNames(team: Team, oldChat: TeamChat, newChatName: string, parentTeam: Team | undefined, childTeams: Team[], liveSessionNames: string[]): string[] {
  const chatNames: string[] = [];
  for (const chat of listReplacedNoticeChats(team, oldChat, newChatName, parentTeam, childTeams, liveSessionNames, "Director", "Read-Find-orchestrator"))
    chatNames.push(chat.chatName);
  return chatNames.sort();
}

test("test_listReplacedNoticeChats_helper_replaced_notifies_only_team_leader", () => {
  // Scenario: a helper (Planner) is replaced. The team has a Director, a TeamLeader and another helper.
  // Step: list the replaced notice chats. Check that only the TeamLeader is in the list.
  const oldChat = buildReplacedChat("T", "Planner", 1, { status: "leaving" });
  const team = buildReplacedTeam("T", [
    buildReplacedChat("T", "Director", 1),
    buildReplacedChat("T", "TeamLeader", 1, { isTeamLeader: true }),
    oldChat,
    buildReplacedChat("T", "Planner", 2),
    buildReplacedChat("T", "PlanAuditor", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T Planner 2", undefined, [], []), ["T TeamLeader 1"]);
});

test("test_listReplacedNoticeChats_helper_replaced_without_team_leader_gives_empty_list", () => {
  // Scenario: a helper (Planner) is replaced in a team that has no TeamLeader.
  // Step: list the replaced notice chats. Check that the list is empty.
  const oldChat = buildReplacedChat("T", "Planner", 1, { status: "leaving" });
  const team = buildReplacedTeam("T", [
    buildReplacedChat("T", "Director", 1),
    oldChat,
    buildReplacedChat("T", "Planner", 2),
    buildReplacedChat("T", "PlanAuditor", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T Planner 2", undefined, [], []), []);
});

test("test_listReplacedNoticeChats_read_find_replaced_notifies_team_leader_and_same_team_director", () => {
  // Scenario: the Read-Find-orchestrator of the Director's own team is replaced. The Director talks to that chat too.
  // Step: list the replaced notice chats. Check that the TeamLeader and the Director are in the list.
  const oldChat = buildReplacedChat("T", "Read-Find-orchestrator", 1, { status: "leaving" });
  const team = buildReplacedTeam("T", [
    buildReplacedChat("T", "Director", 1),
    buildReplacedChat("T", "TeamLeader", 1, { isTeamLeader: true }),
    oldChat,
    buildReplacedChat("T", "Read-Find-orchestrator", 2),
    buildReplacedChat("T", "Planner", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T Read-Find-orchestrator 2", undefined, [], []), ["T Director 1", "T TeamLeader 1"]);
});

test("test_listReplacedNoticeChats_team_leader_replaced_in_first_team_notifies_helpers_and_director", () => {
  // Scenario: the TeamLeader of the first job team is replaced. There is no parent team.
  // Step: list the replaced notice chats. Check that the Director and the helpers are in the list.
  const oldChat = buildReplacedChat("T", "TeamLeader", 1, { isTeamLeader: true, status: "leaving" });
  const team = buildReplacedTeam("T", [
    buildReplacedChat("T", "Director", 1),
    oldChat,
    buildReplacedChat("T", "TeamLeader", 2, { isTeamLeader: true }),
    buildReplacedChat("T", "Planner", 1),
    buildReplacedChat("T", "PlanAuditor", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T TeamLeader 2", undefined, [], []), ["T Director 1", "T PlanAuditor 1", "T Planner 1"]);
});

test("test_listReplacedNoticeChats_team_leader_replaced_in_child_team_notifies_helpers_and_parent_director", () => {
  // Scenario: the TeamLeader of a child team is replaced. The parent team has a Director and a Read-Find-orchestrator.
  // Step: list the replaced notice chats. Check that the child helpers and the parent Director are in the list.
  // Step: check that the parent Read-Find-orchestrator is not in the list.
  const oldChat = buildReplacedChat("C", "TeamLeader", 1, { isTeamLeader: true, status: "leaving" });
  const team = buildReplacedTeam("C", [
    oldChat,
    buildReplacedChat("C", "TeamLeader", 2, { isTeamLeader: true }),
    buildReplacedChat("C", "Planner", 1),
    buildReplacedChat("C", "PlanAuditor", 1),
  ]);
  const parentTeam = buildReplacedTeam("P", [
    buildReplacedChat("P", "Director", 1),
    buildReplacedChat("P", "Read-Find-orchestrator", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "C TeamLeader 2", parentTeam, [], []), ["C PlanAuditor 1", "C Planner 1", "P Director 1"]);
});

test("test_listReplacedNoticeChats_director_that_leads_directly_replaced_notifies_helpers", () => {
  // Scenario: a Director that is also the TeamLeader (isTeamLeader true) is replaced.
  // Step: list the replaced notice chats. Check that both helpers are in the list.
  const oldChat = buildReplacedChat("T", "Director", 1, { isTeamLeader: true, status: "leaving" });
  const team = buildReplacedTeam("T", [
    oldChat,
    buildReplacedChat("T", "Director", 2, { isTeamLeader: true }),
    buildReplacedChat("T", "Planner", 1),
    buildReplacedChat("T", "PlanAuditor", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T Director 2", undefined, [], []), ["T PlanAuditor 1", "T Planner 1"]);
});

test("test_listReplacedNoticeChats_director_that_leads_directly_replaced_notifies_child_team_leader", () => {
  // Scenario: a Director that is also the TeamLeader (isTeamLeader true) is replaced. Its child team "C" is live and has a TeamLeader and a Planner.
  // Step: list the replaced notice chats. Check that the own helpers and the child TeamLeader are in the list.
  // Step: check that the Planner of the child team is not in the list.
  const oldChat = buildReplacedChat("T", "Director", 1, { isTeamLeader: true, status: "leaving" });
  const team = buildReplacedTeam("T", [
    oldChat,
    buildReplacedChat("T", "Director", 2, { isTeamLeader: true }),
    buildReplacedChat("T", "Planner", 1),
    buildReplacedChat("T", "PlanAuditor", 1),
  ]);
  const childTeam = buildReplacedTeam("C", [
    buildReplacedChat("C", "TeamLeader", 1, { isTeamLeader: true }),
    buildReplacedChat("C", "Planner", 1),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T Director 2", undefined, [childTeam], ["C"]), ["C TeamLeader 1", "T PlanAuditor 1", "T Planner 1"]);
});

const replacedDirectorOldChat = buildReplacedChat("T", "Director", 1, { status: "leaving" });
const replacedDirectorTeam = buildReplacedTeam("T", [
  replacedDirectorOldChat,
  buildReplacedChat("T", "Director", 2),
  buildReplacedChat("T", "TeamLeader", 1, { isTeamLeader: true }),
  buildReplacedChat("T", "Read-Find-orchestrator", 1),
  buildReplacedChat("T", "Planner", 1),
]);
const replacedDirectorChildTeam = buildReplacedTeam("C", [
  buildReplacedChat("C", "TeamLeader", 1, { isTeamLeader: true }),
  buildReplacedChat("C", "Planner", 1),
]);

test("test_listReplacedNoticeChats_director_replaced_notifies_read_find_and_team_leaders", () => {
  // Scenario: a Director (not the TeamLeader) is replaced. Its child team is live.
  // Step: list the replaced notice chats. Check that the Read-Find-orchestrator, the own TeamLeader and the child TeamLeader are in the list.
  // Step: check that the Planner of the own team and the Planner of the child team are not in the list.
  const chatNames = listReplacedNoticeChatNames(replacedDirectorTeam, replacedDirectorOldChat, "T Director 2", undefined, [replacedDirectorChildTeam], ["C"]);
  assert.deepEqual(chatNames, ["C TeamLeader 1", "T Read-Find-orchestrator 1", "T TeamLeader 1"]);
});

test("test_listReplacedNoticeChats_director_replaced_leaves_out_team_leader_of_child_team_that_is_not_live", () => {
  // Scenario: a Director (not the TeamLeader) is replaced. Its child team "C" is not in the live session names.
  // Step: list the replaced notice chats. Check that "C TeamLeader 1" is not in the list.
  const chatNames = listReplacedNoticeChatNames(replacedDirectorTeam, replacedDirectorOldChat, "T Director 2", undefined, [replacedDirectorChildTeam], []);
  assert.ok(!chatNames.includes("C TeamLeader 1"));
});

test("test_listReplacedNoticeChats_leaves_out_leaving_starting_new_and_idle_chats", () => {
  // Scenario: a TeamLeader is replaced. The team also has a leaving chat, a starting chat, an idle chat (needsRoleText true) and the new chat.
  // Step: list the replaced notice chats. Check that only the active Planner that has worked is in the list.
  const oldChat = buildReplacedChat("T", "TeamLeader", 1, { isTeamLeader: true, status: "leaving" });
  const team = buildReplacedTeam("T", [
    oldChat,
    buildReplacedChat("T", "TeamLeader", 2, { isTeamLeader: true }),
    buildReplacedChat("T", "Planner", 1),
    buildReplacedChat("T", "Planner", 2, { status: "leaving" }),
    buildReplacedChat("T", "Planner", 3, { status: "starting" }),
    buildReplacedChat("T", "PlanAuditor", 1, { needsRoleText: true }),
  ]);
  assert.deepEqual(listReplacedNoticeChatNames(team, oldChat, "T TeamLeader 2", undefined, [], []), ["T Planner 1"]);
});

const handleValues = {
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS: "Planner,PlanAuditor",
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_JOB: "Director",
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_JOB: "TeamLeader",
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HANDLE_LINE: '- @"{chatName}": {role}',
};

function buildLeaderTeam(): Team {
  return {
    teamName: "T",
    workDirectory: "/w",
    chats: [
      { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "fable", status: "active" as const, isTeamLeader: true },
      { job: "Planner", chatNumber: 1, chatName: "T Planner 1", pane: "%2", model: "sonnet", status: "leaving" as const },
      { job: "Planner", chatNumber: 2, chatName: "T Planner 2", pane: "%3", model: "sonnet", status: "active" as const },
    ],
  };
}

test("test_buildHandle_wraps_the_chat_name_in_quotes_after_an_at_sign", () => {
  // Scenario: the chats message each other by @ handle.
  // Step: build the handle of "X Planner 1". Check the text.
  assert.equal(buildHandle("X Planner 1"), '@"X Planner 1"');
});

test("test_findTeamLeader_returns_the_chat_marked_as_team_leader", () => {
  // Scenario: the Director is the team leader.
  // Step: find the team leader. Check the chat name.
  assert.equal(findTeamLeader(buildLeaderTeam())!.chatName, "T Director 1");
});

test("test_findTeamLeader_returns_undefined_without_a_marked_chat", () => {
  // Scenario: no chat is marked.
  // Step: find the team leader in the sample team. Check for undefined.
  assert.equal(findTeamLeader(sampleTeam), undefined);
});

test("test_findTeamLeader_skips_a_leaving_team_leader", () => {
  // Scenario: the team leader chat is leaving and its new chat is active.
  // Step: mark the old chat leaving and add a marked new chat. Check that the new chat comes back.
  const team = buildLeaderTeam();
  team.chats[0].status = "leaving";
  team.chats.push({ job: "Director", chatNumber: 2, chatName: "T Director 2", pane: "%4", model: "fable", status: "active" as const, isTeamLeader: true });
  assert.equal(findTeamLeader(team)!.chatName, "T Director 2");
});

test("test_markDirectorAsTeamLeader_marks_the_active_director", () => {
  // Scenario: the Director becomes the team leader.
  // Step: mark the director of a team with a Director. Check the field.
  const team: Team = { teamName: "T", workDirectory: "/w", chats: [{ job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "fable", status: "active" }] };
  markDirectorAsTeamLeader(team, "Director");
  assert.equal(team.chats[0].isTeamLeader, true);
});

test("test_markDirectorAsTeamLeader_throws_when_the_team_has_a_team_leader", () => {
  // Scenario: the team has a team leader already.
  // Step: mark the director again. Check the message.
  assert.throws(() => markDirectorAsTeamLeader(buildLeaderTeam(), "Director"), /the team already has a team leader/);
});

test("test_addReplacementChat_keeps_the_team_leader_mark", () => {
  // Scenario: a team leader chat is replaced.
  // Step: replace the Director. Check that the new chat is marked.
  const { newChat } = addReplacementChat(buildLeaderTeam(), "Director");
  assert.equal(newChat.isTeamLeader, true);
});

test("test_buildHandleList_lists_team_leader_first_then_current_helper_chats", () => {
  // Scenario: the Planner was replaced, the PlanAuditor never started.
  // Step: build the list. Check the lines: leader, the new Planner, the first PlanAuditor name.
  assert.equal(buildHandleList(buildLeaderTeam(), handleValues), '- @"T Director 1": TeamLeader\n- @"T Planner 2": Planner\n- @"T PlanAuditor 1": PlanAuditor');
});

test("test_buildHandleList_adds_the_director_chat_at_the_end", () => {
  // Scenario: Mode 2 teams also list the Director of the parent.
  // Step: build the list with a Director chat. Check that its line is last.
  const directorChat = { job: "Director", chatNumber: 1, chatName: "P Director 1", pane: "%9", model: "fable", status: "active" as const };
  const lines = buildHandleList(buildLeaderTeam(), handleValues, directorChat).split("\n");
  assert.equal(lines[lines.length - 1], '- @"P Director 1": Director');
});

test("test_buildHandleList_throws_without_team_leader", () => {
  // Scenario: no chat is the team leader.
  // Step: build the list for the sample team. Check the message.
  assert.throws(() => buildHandleList(sampleTeam, handleValues), /the team has no team leader/);
});

test("test_countLiveJobTeams_counts_own_team_with_team_leader_and_live_child_teams", () => {
  // Scenario: the team has its own job (a team leader) and two child teams, one with a live session.
  // Step: count. Check 2.
  const childTeams = [{ ...sampleTeam, teamName: "T jobB" }, { ...sampleTeam, teamName: "T jobC" }];
  assert.equal(countLiveJobTeams(buildLeaderTeam(), childTeams, ["T", "T jobB"]), 2);
});

test("test_countLiveJobTeams_does_not_count_own_team_without_team_leader", () => {
  // Scenario: no job runs in the own session.
  // Step: count with no child teams. Check 0.
  assert.equal(countLiveJobTeams(sampleTeam, [], ["feature X"]), 0);
});

test("test_findDirectorChatOfJobTeam_undefined_when_team_has_no_team_leader", () => {
  // Scenario: the team has no team leader.
  // Step: find the Director chat for the sample team. Check for undefined.
  assert.equal(findDirectorChatOfJobTeam(sampleTeam, undefined, "TeamLeader", "Director", "planner"), undefined);
});

test("test_findDirectorChatOfJobTeam_undefined_when_the_director_leads_the_team", () => {
  // Scenario: the Director is the team leader, so no other Director exists.
  // Step: find the Director chat for a team led by its Director. Check for undefined.
  const team: Team = { teamName: "T", workDirectory: "/w", chats: [{ job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "fable", status: "active", isTeamLeader: true }] };
  assert.equal(findDirectorChatOfJobTeam(team, undefined, "TeamLeader", "Director", "Planner"), undefined);
});

test("test_findDirectorChatOfJobTeam_undefined_when_the_director_is_replaced", () => {
  // Scenario: the Director is replaced, so the old Director is leaving and the new Director is starting.
  // Step: find the Director chat with the swapped job Director. Check for undefined and no throw.
  const team: Team = {
    teamName: "T",
    workDirectory: "/w",
    chats: [
      { job: "TeamLeader", chatNumber: 1, chatName: "T TeamLeader 1", pane: "%1", model: "sonnet", status: "active", isTeamLeader: true },
      { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%2", model: "fable", status: "leaving" },
      { job: "Director", chatNumber: 2, chatName: "T Director 2", pane: "", model: "fable", status: "starting" },
    ],
  };
  assert.equal(findDirectorChatOfJobTeam(team, undefined, "TeamLeader", "Director", "Director"), undefined);
});

test("test_findDirectorChatOfJobTeam_returns_active_director_of_own_team", () => {
  // Scenario: the team has a team leader and an active Director, and no parent team.
  // Step: find the Director chat with the swapped job Planner. Check that the Director chat of the team comes back.
  const team: Team = {
    teamName: "T",
    workDirectory: "/w",
    chats: [
      { job: "TeamLeader", chatNumber: 1, chatName: "T TeamLeader 1", pane: "%1", model: "sonnet", status: "active", isTeamLeader: true },
      { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%2", model: "fable", status: "active" },
    ],
  };
  assert.equal(findDirectorChatOfJobTeam(team, undefined, "TeamLeader", "Director", "Planner"), team.chats[1]);
});

test("test_findDirectorChatOfJobTeam_returns_active_director_of_parent_team", () => {
  // Scenario: the team has a team leader and no Director, and the parent team has an active Director.
  // Step: find the Director chat with the swapped job Planner. Check that the Director chat of the parent team comes back.
  const team: Team = {
    teamName: "T jobB",
    workDirectory: "/w",
    parentTeam: "T",
    chats: [{ job: "TeamLeader", chatNumber: 1, chatName: "T jobB TeamLeader 1", pane: "%1", model: "sonnet", status: "active", isTeamLeader: true }],
  };
  const parentTeam: Team = {
    teamName: "T",
    workDirectory: "/w",
    chats: [{ job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%2", model: "fable", status: "active" }],
  };
  assert.equal(findDirectorChatOfJobTeam(team, parentTeam, "TeamLeader", "Director", "Planner"), parentTeam.chats[0]);
});

test("test_findDirectorChatOfJobTeam_throws_when_no_active_director", () => {
  // Scenario: the team has a team leader and no Director anywhere.
  // Step: find the Director chat with the swapped job Planner. Check that it throws.
  const team: Team = {
    teamName: "T",
    workDirectory: "/w",
    chats: [{ job: "TeamLeader", chatNumber: 1, chatName: "T TeamLeader 1", pane: "%1", model: "sonnet", status: "active", isTeamLeader: true }],
  };
  assert.throws(() => findDirectorChatOfJobTeam(team, undefined, "TeamLeader", "Director", "Planner"));
});

test("test_hasBackgroundWorkDialog_true_for_dialog_screen", () => {
  // Scenario: the chat shows the exit dialog for running background work.
  // Step: check a screen with the dialog. Check for true.
  const screen = " Background work is running\n The following will stop when you exit:\n\n subagent · Apply blocked handoff steps\n\n ❯ 1. Exit and stop tasks\n 2. Move to background and exit\n 3. Stay\n\n Enter to confirm · Esc to cancel";
  assert.equal(hasBackgroundWorkDialog(screen), true);
});

test("test_hasBackgroundWorkDialog_false_for_idle_chat_screen", () => {
  // Scenario: the chat is idle with an empty input box.
  // Step: check a screen with output, a rule line and an empty box. Check for false.
  const screen = "some output\n\n──────────\n❯ \n──────────\n  ? for shortcuts";
  assert.equal(hasBackgroundWorkDialog(screen), false);
});

test("test_hasBackgroundWorkDialog_false_for_other_dialog", () => {
  // Scenario: the chat shows a dialog that is not the background work dialog.
  // Step: check a screen with another dialog. Check for false.
  assert.equal(hasBackgroundWorkDialog("Pick one\n  Enter to select · Esc to cancel"), false);
});

const replacementModelValues = {
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_TEAMLEADER_MODEL: "opus",
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_PLANNER_MODEL: "haiku",
  CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_DIRECTOR_MODEL: "haiku",
};

test("test_getReplacementChatModel_reads_the_setting_for_a_teamleader", () => {
  // Scenario: the old chat is the TeamLeader and its model differs from the setting.
  // Step: get the replacement model for the old TeamLeader chat. Check that the TeamLeader setting comes back.
  const oldChat = { job: "TeamLeader", chatNumber: 1, chatName: "T TeamLeader 1", pane: "%1", model: "fable", status: "leaving" as const, isTeamLeader: true };
  assert.equal(getReplacementChatModel(oldChat, "TeamLeader", replacementModelValues), "opus");
});

test("test_getReplacementChatModel_keeps_the_old_model_for_another_job", () => {
  // Scenario: the old chat is a Planner and its model differs from the Planner setting.
  // Step: get the replacement model for the old Planner chat. Check that the old model comes back.
  const oldChat = { job: "Planner", chatNumber: 1, chatName: "T Planner 1", pane: "%1", model: "sonnet", status: "leaving" as const };
  assert.equal(getReplacementChatModel(oldChat, "TeamLeader", replacementModelValues), "sonnet");
});

test("test_getReplacementChatModel_keeps_the_old_model_for_a_director_that_leads_the_team", () => {
  // Scenario: the old chat is a Director that leads the team and its model differs from the Director setting.
  // Step: get the replacement model for the old Director chat. Check that the old model comes back.
  const oldChat = { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "fable", status: "leaving" as const, isTeamLeader: true };
  assert.equal(getReplacementChatModel(oldChat, "TeamLeader", replacementModelValues), "fable");
});

test("test_buildTranscriptDirectory_replaces_every_other_character_with_a_dash", () => {
  // Scenario: the chat records of a work folder sit in a folder named after the work folder path.
  // Step: build the folder for a work folder path with spaces, dots and slashes. Check that every character that is not a letter or a digit is a dash.
  assert.equal(
    buildTranscriptDirectory("/home/u/.claude/projects", "/Users/u/Desktop/claude code src/RevEng/.claude/worktrees/run-jfred-roadmap-2-page"),
    "/home/u/.claude/projects/-Users-u-Desktop-claude-code-src-RevEng--claude-worktrees-run-jfred-roadmap-2-page",
  );
});

test("test_findSessionIdOfChat_returns_the_session_id_of_the_matching_file", () => {
  // Scenario: two chat record files hold two different chat names.
  // Step: ask for the session id of "T page TeamLeader 1". Check that the id of the file with that name comes back.
  const directory = mkdtempSync(join(tmpdir(), "transcripts-"));
  writeFileSync(join(directory, "aaa.jsonl"), '{"type":"custom-title","customTitle":"T page TeamLeader 1","sessionId":"aaa"}\n');
  writeFileSync(join(directory, "bbb.jsonl"), '{"type":"custom-title","customTitle":"T page Planner 1","sessionId":"bbb"}\n');
  assert.equal(findSessionIdOfChat(directory, "T page TeamLeader 1"), "aaa");
});

test("test_findSessionIdOfChat_does_not_match_a_longer_chat_name", () => {
  // Scenario: the only file holds the chat name "T page TeamLeader 10".
  // Step: ask for "T page TeamLeader 1". Check for undefined.
  const directory = mkdtempSync(join(tmpdir(), "transcripts-"));
  writeFileSync(join(directory, "ccc.jsonl"), '{"type":"custom-title","customTitle":"T page TeamLeader 10","sessionId":"ccc"}\n');
  assert.equal(findSessionIdOfChat(directory, "T page TeamLeader 1"), undefined);
});

test("test_findSessionIdOfChat_returns_the_file_that_changed_last", () => {
  // Scenario: two files hold the same chat name and one file is one hour newer.
  // Steps: write both files. Set the change times. Ask for the name. Check that the id of the newer file comes back.
  const directory = mkdtempSync(join(tmpdir(), "transcripts-"));
  writeFileSync(join(directory, "new.jsonl"), '{"type":"custom-title","customTitle":"T page TeamLeader 1","sessionId":"new"}\n');
  writeFileSync(join(directory, "old.jsonl"), '{"type":"custom-title","customTitle":"T page TeamLeader 1","sessionId":"old"}\n');
  const nowSeconds = Date.now() / 1000;
  utimesSync(join(directory, "old.jsonl"), nowSeconds - 7200, nowSeconds - 7200);
  utimesSync(join(directory, "new.jsonl"), nowSeconds - 3600, nowSeconds - 3600);
  assert.equal(findSessionIdOfChat(directory, "T page TeamLeader 1"), "new");
});

test("test_findSessionIdOfChat_undefined_when_no_file_matches", () => {
  // Scenario: the only file holds another chat name.
  // Step: ask for "T page TeamLeader 1". Check for undefined.
  const directory = mkdtempSync(join(tmpdir(), "transcripts-"));
  writeFileSync(join(directory, "eee.jsonl"), '{"type":"custom-title","customTitle":"T page Planner 1","sessionId":"eee"}\n');
  assert.equal(findSessionIdOfChat(directory, "T page TeamLeader 1"), undefined);
});

test("test_findSessionIdOfChat_ignores_files_that_are_not_jsonl", () => {
  // Scenario: the only file holds the chat name but its name ends with .json.
  // Step: ask for "T page TeamLeader 1". Check for undefined.
  const directory = mkdtempSync(join(tmpdir(), "transcripts-"));
  writeFileSync(join(directory, "ddd.json"), '{"type":"custom-title","customTitle":"T page TeamLeader 1","sessionId":"ddd"}\n');
  assert.equal(findSessionIdOfChat(directory, "T page TeamLeader 1"), undefined);
});

test("test_listChatsInSwap_empty_when_all_chats_are_active", () => {
  // Scenario: no chat swap is in progress.
  // Step: list the chats in a swap for the sample team. Check for an empty list.
  assert.deepEqual(listChatsInSwap(sampleTeam), []);
});

test("test_listChatsInSwap_returns_leaving_and_starting_chats", () => {
  // Scenario: the team has one active chat, one leaving chat and one starting chat.
  // Step: list the chats in a swap. Check that the leaving chat and the starting chat come back, in team order.
  const team: Team = {
    teamName: "T",
    workDirectory: "/w",
    chats: [
      { job: "Director", chatNumber: 1, chatName: "T Director 1", pane: "%1", model: "fable", status: "active" },
      { job: "Planner", chatNumber: 1, chatName: "T Planner 1", pane: "%2", model: "sonnet", status: "leaving" },
      { job: "Planner", chatNumber: 2, chatName: "T Planner 2", pane: "", model: "sonnet", status: "starting" },
    ],
  };
  assert.deepEqual(listChatsInSwap(team).map((chat) => chat.chatName), ["T Planner 1", "T Planner 2"]);
});

test("test_findPlanAuditorToWaitFor_gives_the_active_plan_auditor", () => {
  // Scenario: the team has an active TeamLeader, an active Planner and an active PlanAuditor.
  // Step: ask for the plan auditor to wait for. Check that the PlanAuditor chat comes back.
  const team: Team = {
    teamName: "J",
    workDirectory: "/w",
    chats: [
      { job: "TeamLeader", chatNumber: 1, chatName: "J TeamLeader 1", pane: "%1", model: "fable", status: "active" },
      { job: "Planner", chatNumber: 1, chatName: "J Planner 1", pane: "%2", model: "sonnet", status: "active" },
      { job: "PlanAuditor", chatNumber: 1, chatName: "J PlanAuditor 1", pane: "%3", model: "sonnet", status: "active" },
    ],
  };
  assert.equal(findPlanAuditorToWaitFor(team, "PlanAuditor")?.chatName, "J PlanAuditor 1");
});

test("test_findPlanAuditorToWaitFor_gives_nothing_without_a_plan_auditor", () => {
  // Scenario: the team has only a TeamLeader and a Planner.
  // Step: ask for the plan auditor to wait for. Check for undefined.
  const team: Team = {
    teamName: "J",
    workDirectory: "/w",
    chats: [
      { job: "TeamLeader", chatNumber: 1, chatName: "J TeamLeader 1", pane: "%1", model: "fable", status: "active" },
      { job: "Planner", chatNumber: 1, chatName: "J Planner 1", pane: "%2", model: "sonnet", status: "active" },
    ],
  };
  assert.equal(findPlanAuditorToWaitFor(team, "PlanAuditor"), undefined);
});

test("test_findPlanAuditorToWaitFor_skips_a_plan_auditor_that_is_not_active", () => {
  // Scenario: the only PlanAuditor chat has status "leaving".
  // Step: ask for the plan auditor to wait for. Check for undefined.
  const team: Team = {
    teamName: "J",
    workDirectory: "/w",
    chats: [
      { job: "TeamLeader", chatNumber: 1, chatName: "J TeamLeader 1", pane: "%1", model: "fable", status: "active" },
      { job: "PlanAuditor", chatNumber: 1, chatName: "J PlanAuditor 1", pane: "%3", model: "sonnet", status: "leaving" },
    ],
  };
  assert.equal(findPlanAuditorToWaitFor(team, "PlanAuditor"), undefined);
});
