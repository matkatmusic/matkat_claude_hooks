#!/usr/bin/env node
import { checkTaskListId } from "../shared/task-list-id.ts";

const minLength = 3;
const allowedCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.";

function getTaskListIdProblem(taskListId: string): string | undefined {
  if (taskListId.length < minLength)
    return `is too short: use at least ${minLength} characters`;
  const startsWithDot = taskListId.startsWith(".");
  if (startsWithDot)
    return 'starts with ".": the value is a folder name under the tasks folder';
  for (const character of taskListId) {
    const isAllowed = allowedCharacters.includes(character);
    if (!isAllowed)
      return 'has a character that is not allowed: use only letters, digits, "-", "_" and "."';
  }
  return undefined;
}

// SessionStart hook: warn the user when CLAUDE_CODE_TASK_LIST_ID is missing or is not a good folder name.
const taskListId = process.env.CLAUDE_CODE_TASK_LIST_ID;
const missingMessage = checkTaskListId(taskListId);
let systemMessage = missingMessage;
if (!missingMessage) {
  const problem = getTaskListIdProblem(taskListId as string);
  if (problem)
    systemMessage = `CLAUDE_CODE_TASK_LIST_ID ${problem}.\n\nThe value "${taskListId}" names a task folder. Set a project name in the project .claude/settings.json.`;
}
if (systemMessage)
  console.log(JSON.stringify({ systemMessage }));
