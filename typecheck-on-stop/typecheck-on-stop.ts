#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { findEditedFilePaths, findSubagentEditedFilePaths } from "../shared/debt-transcript.ts";
import { readEnvValue } from "../shared/env.ts";
// Stop/SubagentStop: blocks the stop while tsc reports type errors, when a .ts file was edited this turn.

if (import.meta.main) {
  const maxErrorLines = Number(readEnvValue("CLAUDE_HOOKS_TYPECHECK_MAX_ERROR_LINES"));
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isReentrant = input.stop_hook_active === true;
  if (isReentrant)
    process.exit(0);
  const hasTsconfig = existsSync(`${input.cwd}/tsconfig.json`);
  if (!hasTsconfig)
    process.exit(0);
  const isSubagentTranscript = typeof input.agent_transcript_path === "string";
  let files: string[];
  if (isSubagentTranscript) {
    const agentTranscript = readFileSync(input.agent_transcript_path, "utf8");
    files = findEditedFilePaths(agentTranscript).files;
  }
  else {
    const transcript = readFileSync(input.transcript_path, "utf8");
    const turn = findEditedFilePaths(transcript);
    files = turn.files;
    const turnStartTimestamp = turn.turnStartTimestamp;
    const hasTurnStart = turnStartTimestamp !== undefined;
    if (hasTurnStart) {
      const transcriptDir = dirname(input.transcript_path);
      const sessionId = basename(input.transcript_path, ".jsonl");
      const subagentsDir = join(transcriptDir, sessionId, "subagents");
      const subagentFiles = findSubagentEditedFilePaths(subagentsDir, turnStartTimestamp);
      for (let i = 0; i < subagentFiles.length; i++)
        files.push(subagentFiles[i]);
    }
  }

  let editedTsFile = false;
  for (let i = 0; i < files.length; i++) {
    const isTsFile = files[i].endsWith(".ts");
    if (isTsFile)
      editedTsFile = true;
  }
  if (!editedTsFile)
    process.exit(0);

  const run = spawnSync("npx", ["tsc", "--noEmit", "-p", "."], { cwd: input.cwd, encoding: "utf8" });
  if (run.status === 0)
    process.exit(0);

  const outputLines = run.stdout.split("\n");
  const errorLines: string[] = [];
  for (let i = 0; i < outputLines.length; i++) {
    const isErrorLine = outputLines[i].includes("error TS");
    const hasRoom = errorLines.length < maxErrorLines;
    const shouldKeepLine = isErrorLine && hasRoom;
    if (shouldKeepLine)
      errorLines.push(outputLines[i]);
  }
  const reason = `Type errors remain. Fix every error below before you stop, including errors in files you did not edit:\n${errorLines.join("\n")}`;
  console.log(JSON.stringify({ decision: "block", reason }));
}
