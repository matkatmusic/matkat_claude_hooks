#!/usr/bin/env bun
import { checkTaskListId } from "../shared/taskListId.ts";

// SessionStart hook: warn the user when CLAUDE_CODE_TASK_LIST_ID is missing or is not a good folder name.
const systemMessage = checkTaskListId(process.env.CLAUDE_CODE_TASK_LIST_ID);
if (systemMessage)
  console.log(JSON.stringify({ systemMessage }));
