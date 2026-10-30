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

// Returns the warning text for a missing or bad task list id, else undefined.
export function checkTaskListId(taskListId: string | undefined): string | undefined {
  if (!taskListId)
    return [
      "CLAUDE_CODE_TASK_LIST_ID is not set.",
      "",
      "Add this to the project .claude/settings.json:",
      "",
      '"env":{"CLAUDE_CODE_TASK_LIST_ID":"<project name>"}',
    ].join("\n");
  const problem = getTaskListIdProblem(taskListId);
  if (problem)
    return `CLAUDE_CODE_TASK_LIST_ID ${problem}.\n\nThe value "${taskListId}" names a task folder. Set a project name in the project .claude/settings.json.`;
  return undefined;
}
