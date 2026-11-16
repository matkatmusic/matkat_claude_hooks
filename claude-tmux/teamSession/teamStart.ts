import { tmux_lib } from "../../tests/external/tmux_lib/tmux_lib.ts";
import { startChatInNewWindow } from "../shared/chatSwap.ts";
import { buildChatName, buildDirectorPaneCommand } from "./teamCommand.ts";
import { buildJobValueKey, buildPaneEnvironmentFlags, lockTeamFile, readTeamFile, unlockTeamFile, writeTeamFile } from "./teamFile.ts";
import type { TeamChat } from "./teamFile.ts";

// Fixed window groups replace the free-slot rule.
// export function findWindowWithFreeSlot(windowLines: string[], panesPerWindow: number): string | undefined {
//   for (const windowLine of windowLines) {
//     const [windowId, paneCountText] = windowLine.split(" ");
//     const windowHasRoom = Number(paneCountText) < panesPerWindow;
//     if (windowHasRoom)
//       return windowId;
//   }
//   return undefined;
// }
//
// export function startChatPane(anchorPane: string, workDirectory: string, environmentFlags: string[], paneCommand: string, values: Record<string, string>): string {
//   const sessionResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", anchorPane, "#{session_id}"], { capture_output: true, text: true, check: true });
//   const sessionId = sessionResult.stdout.trim();
//   const windowListResult = tmux_lib.run(["tmux", "list-windows", "-t", sessionId, "-F", "#{window_id} #{window_panes}"], { capture_output: true, text: true, check: true });
//   const windowLines = windowListResult.stdout.trim().split("\n");
//   const windowWithFreeSlot = findWindowWithFreeSlot(windowLines, Number(values["CLAUDE_HOOKS_CLAUDE_TEAM_PANES_PER_WINDOW"]));
//   let newPaneCommand = ["tmux", "new-window", "-d", "-t", `${sessionId}:`, "-c", workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, paneCommand];
//   if (windowWithFreeSlot !== undefined)
//     newPaneCommand = ["tmux", "split-window", "-d", "-t", windowWithFreeSlot, "-c", workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, paneCommand];
//   const newPaneResult = tmux_lib.run(newPaneCommand, { capture_output: true, text: true, check: true });
//   const newPane = newPaneResult.stdout.trim();
//   tmux_lib.tmux_selectLayout(newPane, values["CLAUDE_HOOKS_CLAUDE_TEAM_WINDOW_LAYOUT"]);
//   return newPane;
// }

export function listHelperWindowJobs(values: Record<string, string>): string[][] {
  const helperWindowJobs: string[][] = [];
  for (const windowLine of values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_HELPER_WINDOWS"].split("\n"))
    helperWindowJobs.push(windowLine.split(","));
  return helperWindowJobs;
}

// export function startChatInNewWindow(anchorPane: string, workDirectory: string, environmentFlags: string[], paneCommand: string): string {
//   // tmux new-window -a rejects a pane id as target: use the window id of the anchor pane
//   const anchorWindowResult = tmux_lib.run(["tmux", "display-message", "-p", "-t", anchorPane, "#{window_id}"], { capture_output: true, text: true, check: true });
//   const anchorWindow = anchorWindowResult.stdout.trim();
//   const newWindowCommand = ["tmux", "new-window", "-d", "-a", "-t", anchorWindow, "-c", workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, paneCommand];
//   const newWindowResult = tmux_lib.run(newWindowCommand, { capture_output: true, text: true, check: true });
//   return newWindowResult.stdout.trim();
// }

export function startChatInSameWindow(anchorPane: string, workDirectory: string, environmentFlags: string[], paneCommand: string, values: Record<string, string>): string {
  const splitCommand = ["tmux", "split-window", "-d", "-h", "-t", anchorPane, "-c", workDirectory, "-P", "-F", "#{pane_id}", ...environmentFlags, paneCommand];
  const splitResult = tmux_lib.run(splitCommand, { capture_output: true, text: true, check: true });
  const newPane = splitResult.stdout.trim();
  tmux_lib.tmux_selectLayout(newPane, values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_WINDOW_LAYOUT"]);
  return newPane;
}

export function startHelperChats(teamFilePath: string, directorPane: string, values: Record<string, string>): string[] {
  const jobs = values["CLAUDE_HOOKS_CLAUDE_TMUX_TEAM_JOBS"].split(",");

  lockTeamFile(teamFilePath);
  const team = readTeamFile(teamFilePath);
  for (const chat of team.chats) {
    const chatIsHelper = jobs.includes(chat.job);
    if (chatIsHelper) {
      unlockTeamFile(teamFilePath);
      throw new Error("the helper chats already exist");
    }
  }
  const helperChats: TeamChat[] = [];
  for (const job of jobs) {
    helperChats.push({ job, chatNumber: 1, chatName: buildChatName(team.teamName, job, 1), pane: "", model: values[buildJobValueKey(job, "MODEL")], status: "starting", needsRoleText: true });
  }
  team.chats.push(...helperChats);
  writeTeamFile(teamFilePath, team);
  unlockTeamFile(teamFilePath);

  // Fixed window groups replace the one-loop pane start.
  // for (const helperChat of helperChats) {
  //   helperChat.pane = startChatPane(directorPane, team.workDirectory, buildPaneEnvironmentFlags(team.teamName, helperChat.job, helperChat.chatName), buildDirectorPaneCommand(helperChat.chatName, helperChat.model, ""), values);
  //   lockTeamFile(teamFilePath);
  //   const teamWithPane = readTeamFile(teamFilePath);
  //   for (const chat of teamWithPane.chats) {
  //     if (chat.chatName === helperChat.chatName)
  //       chat.pane = helperChat.pane;
  //   }
  //   writeTeamFile(teamFilePath, teamWithPane);
  //   unlockTeamFile(teamFilePath);
  // }
  let previousWindowPane = directorPane;
  for (const windowJobs of listHelperWindowJobs(values)) {
    // lastPaneInWindow replaces windowAnchorPane
    let lastPaneInWindow: string | undefined;
    for (const job of windowJobs) {
      let helperChat: TeamChat | undefined;
      for (const chat of helperChats) {
        if (chat.job === job)
          helperChat = chat;
      }
      if (helperChat === undefined)
        throw new Error(`the window value names the job ${job}, and the team has no such job`);
      const environmentFlags = buildPaneEnvironmentFlags(team.teamName, helperChat.job, helperChat.chatName);
      const paneCommand = buildDirectorPaneCommand(helperChat.chatName, helperChat.model, "");
      if (lastPaneInWindow === undefined) {
        helperChat.pane = startChatInNewWindow(previousWindowPane, team.workDirectory, environmentFlags, paneCommand);
        previousWindowPane = helperChat.pane;
      }
      else {
        helperChat.pane = startChatInSameWindow(lastPaneInWindow, team.workDirectory, environmentFlags, paneCommand, values);
      }
      lastPaneInWindow = helperChat.pane;

      lockTeamFile(teamFilePath);
      const teamWithPane = readTeamFile(teamFilePath);
      for (const chat of teamWithPane.chats) {
        if (chat.chatName === helperChat.chatName)
          chat.pane = helperChat.pane;
      }
      writeTeamFile(teamFilePath, teamWithPane);
      unlockTeamFile(teamFilePath);
    }
  }

  for (const helperChat of helperChats) {
    console.log(`Starting ${helperChat.chatName}. Waiting for the chat to be ready.`);
    const readinessCode = tmux_lib.tmux_waitForClaudeReadiness(helperChat.pane);
    if (readinessCode !== 0)
      throw new Error(`${helperChat.chatName} did not become ready in pane ${helperChat.pane}`);

    lockTeamFile(teamFilePath);
    const teamToActivate = readTeamFile(teamFilePath);
    for (const chat of teamToActivate.chats) {
      if (chat.chatName === helperChat.chatName)
        chat.status = "active";
    }
    writeTeamFile(teamFilePath, teamToActivate);
    unlockTeamFile(teamFilePath);
  }

  const helperChatNames: string[] = [];
  for (const helperChat of helperChats)
    helperChatNames.push(helperChat.chatName);
  return helperChatNames;
}
