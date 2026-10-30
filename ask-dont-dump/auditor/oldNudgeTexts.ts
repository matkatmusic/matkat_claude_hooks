import { REPLY_CHECKS } from '../mod/hooks/register';

export const OLD_QUESTION_OR_CHOICE_TEXT = 'Your last message has at least one question or choice for the user. Use AskUserQuestion to have the user make a decision for each question or choice item in the message.';
export const OLD_UNFINISHED_WORK_TEXT = 'Your last message mentioned incomplete or unstarted work. Use TaskCreate to track the work.';
export const OLD_BUG_REPORT_TEXT = "Your last message reported a bug. Create a task in the session task list with TaskCreate to track the bug's resolution. Write a regression test that reproduces the buggy behavior and proves the fix works.";
export const OLD_GIT_COMMIT_TEXT = 'Your last message made a claim about the repository state.  Confirm your claim before telling the user about the repository state';
export const OLD_INCOMPLETE_TASK_TEXT = 'Your last message named an incomplete task.  Confirm against the codebase if the task is actually incomplete.  If the task is completed, mark the task as Completed.  Otherwise, use AskUserQuestion to ask the user if they want to tackle that incomplete task now.';
export const OLD_MISSING_FUNCTIONALITY_TEXT = 'Your last message describes functionality that is missing. Use AskUserQuestion to ask the user if they want it built now, logged as a task, or ignored.';
const OLD_HEAD_MISSING_FUNCTIONALITY_TEXT = 'Your last message describes functionality that is missing. Use AskUserQuestion to ask the user if they want the missing functionality built now, logged as a task, or ignored.';
const FIRST_QUESTION_OR_CHOICE_TEXT = 'Your last message has a question or choice for the user. Use AskUserQuestion to have the user make a decision for each question or choice item in the message.';
const FIRST_UNFINISHED_WORK_TEXT = 'Your last message has incomplete or unstarted work. Use TaskCreate to track the work.';
const FIRST_BUG_REPORT_TEXT = "Your last message reported a bug. Create a task in the session task list with TaskCreate to track the bug's resolution. Write a regression test for the behavior the user reports.";
const FIRST_GIT_COMMIT_TEXT = 'Your last message made a claim about the repo state.  Confirm your claim before telling the user';
const FIRST_INCOMPLETE_TASK_TEXT = 'Your last message named an incomplete task.  Confirm against the codebase if the task is actually incomplete.  If the task is completed, mark the task as Completed.';

const OLD_NUDGE_DIDS: Record<string, string> = {
  [OLD_BUG_REPORT_TEXT]: 'Reported a bug',
  [OLD_QUESTION_OR_CHOICE_TEXT]: 'Asked the user a question or gave a choice',
  [OLD_UNFINISHED_WORK_TEXT]: 'Declared unfinished work',
  [OLD_GIT_COMMIT_TEXT]: 'Made a repo-state claim',
  [OLD_INCOMPLETE_TASK_TEXT]: 'Declared an open task',
  [OLD_MISSING_FUNCTIONALITY_TEXT]: 'Described missing functionality',
  [OLD_HEAD_MISSING_FUNCTIONALITY_TEXT]: 'Described missing functionality',
  [FIRST_BUG_REPORT_TEXT]: 'Reported a bug',
  [FIRST_QUESTION_OR_CHOICE_TEXT]: 'Asked the user a question or gave a choice',
  [FIRST_UNFINISHED_WORK_TEXT]: 'Declared unfinished work',
  [FIRST_GIT_COMMIT_TEXT]: 'Made a repo-state claim',
  [FIRST_INCOMPLETE_TASK_TEXT]: 'Declared an open task',
};

export function assertOldNudgeDidsHaveChecks() {
  for (const [text, did] of Object.entries(OLD_NUDGE_DIDS)) {
    let hasCheck = false;
    for (const check of REPLY_CHECKS) {
      if (check.did === did)
        hasCheck = true;
    }
    if (!hasCheck)
      throw new Error(`old nudge text has no REPLY_CHECKS row with did "${did}": ${text}`);
  }
}

export function containsOldNudge(nudgeText: string, did: string): boolean {
  for (const [text, textDid] of Object.entries(OLD_NUDGE_DIDS)) {
    const isSameDid = textDid === did;
    const isTextPresent = nudgeText.includes(text);
    const isMatch = isSameDid && isTextPresent;
    if (isMatch)
      return true;
  }
  return false;
}
