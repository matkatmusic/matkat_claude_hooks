#!/usr/bin/env node
// SessionStart hook: hands the model the .idleState state files from the last window of time.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readEnvValue } from "../shared/env.ts";

const IDLE_STATE_FOLDER_NAME = ".idleState";

export function buildStateContext(folder: string, nowMs: number): string {
  const windowMs = Number(readEnvValue("CLAUDE_HOOKS_IDLE_STATE_WINDOW_MS"));
  const hasFolder = existsSync(folder);
  if (!hasFolder)
    return "";
  const paths: string[] = [];
  for (const name of readdirSync(folder).sort()) {
    const isJsonFile = name.endsWith(".json");
    if (!isJsonFile)
      continue;
    const path = `${folder}/${name}`;
    const isRecent = nowMs - statSync(path).mtimeMs < windowMs;
    if (isRecent)
      paths.push(path);
  }
  if (paths.length === 0)
    return "";
  const text = `Tell me about the recent work written in the state files ${paths.join(", ")}`;
  // for (const path of paths)
  //   text += `\n\n# ${path}\n${readFileSync(path, "utf8")}`;
  return text;
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  // const context = buildStateContext(`${input.cwd}/${readEnvValue("CLAUDE_HOOKS_IDLE_STATE_FOLDER_NAME")}`, Date.now());
  const context = buildStateContext(`${input.cwd}/${IDLE_STATE_FOLDER_NAME}`, Date.now());
  if (context !== "")
    console.log(context);
}
