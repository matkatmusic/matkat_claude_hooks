#!/usr/bin/env bun
// Runs the TypeSafe filters on the .idleState lists and prints the catch-up skill body.
import { homedir } from "node:os";
import { join } from "node:path";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { collectLists, getProjectFolderName } from "./collect.ts";
import { removeKnownTraps } from "./removeKnownTraps.ts";
import { mergeSameMeaningItems, removeCompletedItems, writeTypesafeLog, type TypesafeLog } from "./typesafeFilters.ts";

export async function buildSkillBody(): Promise<string> {
  const root = process.cwd();
  const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
  if (!taskListId)
    throw new Error("CLAUDE_CODE_TASK_LIST_ID is not set");
  const claudeFolder = join(homedir(), ".claude");
  const projectFolderName = getProjectFolderName(root);
  const transcriptFolder = join(claudeFolder, "projects", projectFolderName);
  const memoryFolder = join(transcriptFolder, "memory");
  const skillFolder = import.meta.dirname;

  const lists = collectLists(root);
  const client = new TypeSafeClient();
  const log: TypesafeLog = [];
  const tasksFolder = join(claudeFolder, "tasks", taskListId);
  lists.not_done = await removeCompletedItems(client, lists.not_done, tasksFolder, "not_done", log);
  lists.actions = await removeCompletedItems(client, lists.actions, tasksFolder, "actions", log);
  lists.questions = await removeCompletedItems(client, lists.questions, tasksFolder, "questions", log);
  const traps = await removeKnownTraps(client, lists.rules, lists.mistakes, memoryFolder, join(claudeFolder, "CLAUDE.md"), join(root, "CLAUDE.md"), log);
  lists.rules = traps.rules;
  lists.mistakes = traps.mistakes;
  lists.not_done = await mergeSameMeaningItems(client, lists.not_done, "not_done", log);
  lists.actions = await mergeSameMeaningItems(client, lists.actions, "actions", log);
  lists.questions = await mergeSameMeaningItems(client, lists.questions, "questions", log);
  lists.rules = await mergeSameMeaningItems(client, lists.rules, "rules", log);
  lists.mistakes = await mergeSameMeaningItems(client, lists.mistakes, "mistakes", log);
  writeTypesafeLog(root, log, new Date());

  return `# catch-up

Read the state files of past chats. Show the user what is still open.

The script already merged items that say the same thing. It also dropped items that TypeSafe matched to a completed task, a memory file, or CLAUDE.md.

\`\`\`json
${JSON.stringify(lists, null, 2)}
\`\`\`

## Steps
1. Start one subagent with \`model: haiku\`. Give it the json block above and your scratchpad folder. It does these steps in order:
   a. It checks only \`not_done\`, \`actions\`, and \`questions\`. The stamp is the \`YYYY-MM-DD-HHMM\` at the start of the \`file\` value. It drops each item that one of these sources shows as done since the stamp:
      - \`git log\` and the working tree.
      - A claude-mem note. It finds notes with the \`search\` tool of the claude-mem MCP server.
      - A newer state file with the same \`sessionId\` that does not list the item.
   It keeps an item when no source shows it as done.
   When an item is not clear, the subagent may read the transcript of the chat that made it. The transcript is \`${transcriptFolder}/<sessionId>.jsonl\`. An item with no \`sessionId\` has no transcript.
   b. It sorts each \`rules\` or \`mistakes\` item. A lasting item holds for every chat in this project. A one-chat item names one chat's files, branch, or work. It drops each one-chat item.
   c. For each lasting item, it writes one memory file in \`${memoryFolder}/\` with the Write tool. The file has frontmatter with \`name\`, \`description\`, and \`metadata.type: feedback\`, then the item text. It adds one line for the file to \`MEMORY.md\` in that folder.
   d. It writes one JSON file to \`<scratchpad folder>/catch-up-merge.json\` with the Write tool. The file has \`not_done\`, \`actions\`, and \`questions\` as lists of text only. \`rules\` and \`mistakes\` are empty lists. The file also has the \`files\` list from the json block unchanged.
   e. It runs \`bun "${skillFolder}/writeMerged.ts" <scratchpad folder>/catch-up-merge.json\` one time from \`${root}\`.
   f. It returns \`not_done\`, \`actions\`, and \`questions\` with the items that are left. Nothing else.
2. Show the user \`not_done\`, \`actions\`, and \`questions\`.
3. Call TaskList. For each \`not_done\` or \`actions\` item that no open task covers, make a task. An \`actions\` item that only says to wait, or gives an order for one chat only, needs no task.

## Rules
- Do not ask the user anything in this skill. A Stop hook turns the shown items into questions.
- Do not change the text of an item.
- If the script fails, show the error. Do not guess the lists.
`;
}

if (import.meta.main)
  process.stdout.write(await buildSkillBody());
