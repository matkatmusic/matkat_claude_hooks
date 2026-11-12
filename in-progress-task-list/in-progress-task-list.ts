#!/usr/bin/env node
import { buildSubjectListForStatus, findTaskFolder, readPromptFromStdin, TASK_LIST_ID_NOT_SET_REASON, writeBlockDecision } from "../shared/session-tasks.ts";

// UserPromptSubmit hook: /in-progress-task-list blocks the prompt and shows the subject of each in-progress session task.
const prompt = readPromptFromStdin();
if (prompt.split(/\s/)[0] !== "/in-progress-task-list")
    process.exit(0);

const taskFolder = findTaskFolder();
if (taskFolder === undefined) {
    writeBlockDecision(TASK_LIST_ID_NOT_SET_REASON);
    process.exit(0);
}
writeBlockDecision(buildSubjectListForStatus(taskFolder, "in_progress"));
