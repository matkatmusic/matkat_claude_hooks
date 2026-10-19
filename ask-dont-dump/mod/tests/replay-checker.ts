import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "fs";
import { spawnSync } from "node:child_process";

/*
*   Usage by model:
*        claude-opus-5-5:  2.6k input, 24.3k output, 6.3m cache read, 209.2k cache write ($3.43)
*       claude-sonnet-5-5:  16.7k input, 24.9k output, 2.2m cache read, 164.1k cache write ($0.92)
*       claude-haiku-5-5:  247 input, 2.8k output, 141.1k cache read, 33.5k cache write ($0.0070)
*/


export const OLD_PROMPT_COMMIT = "27dcbb2d18527df9043254a9d85959f7079dbbca";
export const NEW_PROMPT_COMMIT ="bd6e59c3164ab8a645dc1a7594268a4dfe49ec86";
const NEW_PROMPT_OVERRIDE_LINES: string[] = [
  "You check one agent reply before the agent stops.",
  "",
  "Hook input JSON: $ARGUMENTS",
  "",
  "Read `last_assistant_message`." ,
  "It is the agent's final reply of this turn. Run each check below.",
  // "Count an item as added to the task list, or as asked with `AskUserQuestion`, only when the reply text says so.",
  "",
  "Rules for all checks:",
  "Do not flag the following cases; these cases always pass:",
  "- The reply only says the agent waits for the user, such as \"Waiting for your answer.\" or \"Tell me when to continue.\"",
  "- The reply says the agent is waiting for a subagent (helper) to finish, such as \"The task stays open until the helper finishes.\" or \"I'm waiting for the agent to send me their report.\".",
  "- The reply lists items that it added to the task list in this same turn (`TaskCreate`), or that it asks about with `AskUserQuestion`.",
  "- stop_hook_active is `true`, and the reply text says it asked with `AskUserQuestion` or added tasks with `TaskCreate`. A hook already blocked this stop once, so answer `{\"ok\": true}`.",
  "- The whole reply is one bare JSON object with the following keys: `work`, `done`, `not_done`, `files`, `runningPrograms`, `nextSteps`, `traps`. A bare JSON object with these keys is an `idle-state` mod handoff, not a dropped issue, so answer `{\"ok\": true}`.",
  "",
  "If every check's result is 'no', answer `{\"ok\": true}`.",
  "Otherwise, answer `{\"ok\": false, \"reason\": \"<the reason of each 'yes' check, one after the other>\"}`.",
  "",
  "Check #1. ",
  "Context: The user misses questions and loose ends in the prose at the end of a reply. The `AskUserQuestion` dialog makes each one a choice they answer.",
  "Your question: Does the agent's reply leave any of the following types of expressions for the user to catch or interpret without using `AskUserQuestion`?",
  "",
  "- issues.",
  "- open decisions.",
  "- open TaskList items.",
  "- asked a question ('?'), including a question that gave choices.",
  "- wrote \"say the word\"-style items.",
  "- wrote \"next action:\"-style items.",
  "- wrote \"not checked\" or similar prose.",
  "Examples of a dropped issue:",
  "- \"Task #20 is still open.\".",
  "- \"Not checked: the context-exit warning\".",
  "- \"The editor still shows hints. They are only hints.\".",
  "",
  "If yes, the reason is: \"<quote the sentence or sentences>. Use AskUserQuestion to resolve them now.\"",
  "",
  "Check #2. ",
  "Context: The user has no awareness of individual steps in any multi-step work that the agent states as needing to be done.",
  "Your question: Does the reply say the agent is starting multi-step work now? A reply that only quotes or names such steps does not count.",
  "If yes, the reason is: \"You are starting work on a task. Make or add to the project's task list (TaskCreate) before you continue. Delegate the build to subagents. Two subagents must not edit the same files at the same time: give each feature its own worktree (Agent isolation: 'worktree') and merge afterward, or run the subagents one after another.\"",
  "",
  "Check #3. ",
  "Context: The user has no awareness of incomplete work when the agent finishes the turn. ",
  "Your question: Does the reply name work that still needs to be built and was not done this turn? A reply that only quotes or names such work does not count. Skip items that Check #1 already quotes.",
  "",
  "If yes, the reason is: \"<quote each item>. If an item is not on your task list, add it with TaskCreate, then end the turn.\"",
  "",

];
const NEW_PROMPT_OVERRIDE: string = NEW_PROMPT_OVERRIDE_LINES.join("\n");
const PROMPT_PATH_IN_REPO = "ask-dont-dump/mod/ask-dont-dump-prompt.md";

const dir = import.meta.dirname;
const hasNewPromptOverride = NEW_PROMPT_OVERRIDE !== "";
let logFilePath = "";

function writeLogLine(text: string): void {
  console.log(text);
  appendFileSync(logFilePath, `${text}\n`);
}

function readGitOutput(args: string[]): string {
  const proc = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  if (proc.status !== 0)
    throw new Error(`git ${args.join(" ")} exit ${proc.status}: ${proc.stderr}`);
  return proc.stdout;
}

const repoRoot = readGitOutput(["rev-parse", "--show-toplevel"]).trim();

export function loadPrompt(commit: string): string {
  const proc = spawnSync("git", ["show", `${commit}:${PROMPT_PATH_IN_REPO}`], { cwd: repoRoot, encoding: "utf8" });
  if (proc.status !== 0)
    throw new Error(`git show ${commit} exit ${proc.status}: ${proc.stderr}`);
  return proc.stdout;
}

const samples: { id: string; expect: boolean; text: string }[] = JSON.parse(readFileSync(`${dir}/samples.json`, "utf8"));
const prompts: Record<string, string> = {
  OLD: loadPrompt(OLD_PROMPT_COMMIT),
  NEW: hasNewPromptOverride ? NEW_PROMPT_OVERRIDE : loadPrompt(NEW_PROMPT_COMMIT),
};

function fetchModelOutput(prompt: string): string {
  const proc = spawnSync(
    "claude",
    ["-p","--model", "claude-haiku-5-5", "--setting-sources", "", "--system-prompt", "You are a reviewer of assistant replies, tasked with determining if the assistant's reply matches certain criteria. Follow the prompt.", "--tools", "", "--no-session-persistence", "--disable-slash-commands"],
    { input: prompt, encoding: "utf8", cwd: dir },
  );
  if (proc.status !== 0)
    throw new Error(`exit ${proc.status}: ${proc.stderr}`);
  const trimmed = proc.stdout.trim();
  const looksLikeJson = trimmed.startsWith("{") && trimmed.endsWith("}");
  if (looksLikeJson)
    writeLogLine(JSON.stringify(JSON.parse(trimmed), null, 2));
  else
    writeLogLine(proc.stdout);
  return proc.stdout;
}

function executePass(version: string, s: { id: string; expect: boolean; text: string }, run: number): any {
  const hookInput = JSON.stringify({ last_assistant_message: s.text, stop_hook_active: false });
  const prompt = prompts[version].split("$ARGUMENTS").join(hookInput);
  writeLogLine(`=== ${version} ${s.id} run ${run} prompt ===`);
  writeLogLine(prompt);
  const raw = fetchModelOutput(prompt);
  const verdict = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
  return { version, id: s.id, expect: s.expect, run, ok: verdict.ok, reason: verdict.reason, raw };
}

if (import.meta.main) {
  const usage = "usage: bun replay-checker.ts [<OLD|NEW> <sample-id>]";
  const args = process.argv.slice(2);
  const hasWrongArgCount = args.length !== 0 && args.length !== 2;
  if (hasWrongArgCount)
    throw new Error(`expected 0 or 2 arguments, got ${args.length}. ${usage}`);
  const isSingleRun = args.length === 2;
  let versionsToRun = ["OLD", "NEW"];
  let samplesToRun = samples;
  let runsPerSample = 3;
  if (isSingleRun) {
    const validVersions = Object.keys(prompts);
    const isKnownVersion = validVersions.includes(args[0]);
    if (!isKnownVersion)
      throw new Error(`unknown version "${args[0]}". valid versions: ${validVersions.join(", ")}. ${usage}`);
    const validIds: string[] = [];
    let pickedSample = samples[0];
    let foundSample = false;
    for (const s of samples) {
      validIds.push(s.id);
      if (s.id === args[1]) {
        pickedSample = s;
        foundSample = true;
      }
    }
    if (!foundSample)
      throw new Error(`unknown sample id "${args[1]}". valid sample ids: ${validIds.join(", ")}. ${usage}`);
    versionsToRun = [args[0]];
    samplesToRun = [pickedSample];
    runsPerSample = 1;
  }
  const startedAt = new Date().toISOString();
  const resultsDir = `${dir}/results`;
  mkdirSync(resultsDir, { recursive: true });
  const timestamp = startedAt.slice(0, 19).replaceAll(":", "-");
  const outPath = `${resultsDir}/${timestamp}.json`;
  logFilePath = `${resultsDir}/${timestamp}.log`;
  writeLogLine(`old prompt: ${OLD_PROMPT_COMMIT}`);
  writeLogLine(`new prompt: ${hasNewPromptOverride ? "NEW_PROMPT_OVERRIDE" : NEW_PROMPT_COMMIT}`);
  const all: any[] = [];
  for (const version of versionsToRun) {
    for (const s of samplesToRun) {
      for (let run = 1; run <= runsPerSample; run++) {
        const record = executePass(version, s, run);
        all.push(record);
      }
    }
  }
  const finishedAt = new Date().toISOString();

  const rows: string[] = [];
  for (const s of samplesToRun) {
    let oldPasses = 0;
    let newPasses = 0;
    for (const r of all) {
      const isOtherSample = r.id !== s.id;
      const isFailedRun = r.ok !== true;
      const shouldSkipRun = isOtherSample || isFailedRun;
      if (shouldSkipRun)
        continue;
      if (r.version === "OLD")
        oldPasses++;
      if (r.version === "NEW")
        newPasses++;
    }
    rows.push(`${s.id} | ${s.expect} | OLD ${oldPasses}/${runsPerSample} | NEW ${newPasses}/${runsPerSample}`);
  }
  if (isSingleRun)
    writeLogLine(JSON.stringify(all[0], null, 2));

  const newPromptCommit = hasNewPromptOverride ? null : NEW_PROMPT_COMMIT;
  const newPromptOverride = hasNewPromptOverride ? NEW_PROMPT_OVERRIDE : null;
  writeFileSync(outPath, JSON.stringify({ oldPromptCommit: OLD_PROMPT_COMMIT, newPromptCommit, newPromptOverride, startedAt, finishedAt, runs: all, summary: rows }, null, 2));
  writeLogLine(rows.join("\n"));
  writeLogLine(outPath);
}
