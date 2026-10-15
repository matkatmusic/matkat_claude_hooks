// Returns the systemMessage text when the task list id is missing, else undefined.
export function checkTaskListId(taskListId: string | undefined): string | undefined {
  if (taskListId)
    return undefined;
  return [
    "CLAUDE_CODE_TASK_LIST_ID is not set.",
    "",
    "Add this to the project .claude/settings.json:",
    "",
    '"env":{"CLAUDE_CODE_TASK_LIST_ID":"<project name>"}',
  ].join("\n");
}
