#!/usr/bin/env node
import { checkTaskListId } from "../shared/task-list-id.ts";
// SessionStart hook: warn the user when the project has no CLAUDE_CODE_TASK_LIST_ID.
const systemMessage = checkTaskListId(process.env.CLAUDE_CODE_TASK_LIST_ID);
if (systemMessage)
  console.log(JSON.stringify({ systemMessage }));
