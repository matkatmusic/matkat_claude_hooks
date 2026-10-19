#!/usr/bin/env node
// Counts turns per conversation into the session state file's sittings list.

import { mkdir, readdir, readFile, stat, unlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { getSessionStatePath, readSessionState, writeSessionState } from "../shared/session-state.ts";
import type { Sitting } from "../shared/session-state.ts";
import { getSetting } from "../shared/settings.ts";

async function listDir(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);
    const paths: string[] = [];
    for (let i = 0; i < names.length; i++)
      paths.push(`${dir}/${names[i]}`);
    return paths;
  }
  catch {
    return [];
  }
}

// Subagent and workflow tokens never reach the parent transcript, so gather their own files.
export async function findSidechainPaths(
  transcriptPath: string,
  scratchRoot: string,
): Promise<string[]> {
  const sessionDir = transcriptPath.replace(/\.jsonl$/, "");
  const sessionId = sessionDir.slice(sessionDir.lastIndexOf("/") + 1);
  const projectDir = transcriptPath.slice(0, transcriptPath.lastIndexOf("/"));
  const projectName = projectDir.slice(projectDir.lastIndexOf("/") + 1);
  // Workflow agents write only under the scratchpad; the durable subagents/ folder misses them.
  const scratchEntries = await listDir(scratchRoot);
  const scratchRoots: string[] = [];
  for (let i = 0; i < scratchEntries.length; i++) {
    const isClaudeRoot = scratchEntries[i].includes("/claude-");
    if (isClaudeRoot)
      scratchRoots.push(scratchEntries[i]);
  }
  const dirs = [`${sessionDir}/subagents`];
  for (let i = 0; i < scratchRoots.length; i++)
    dirs.push(`${scratchRoots[i]}/${projectName}/${sessionId}/tasks`);
  const listings: Promise<string[]>[] = [];
  for (let i = 0; i < dirs.length; i++)
    listings.push(listDir(dirs[i]));
  const listed = await Promise.all(listings);
  const allPaths = listed.flat();
  const sidechainFiles: string[] = [];
  for (let i = 0; i < allPaths.length; i++) {
    const isJsonl = allPaths[i].endsWith(".jsonl");
    const isOutput = allPaths[i].endsWith(".output");
    const isSidechainFile = isJsonl || isOutput;
    if (isSidechainFile)
      sidechainFiles.push(allPaths[i]);
  }
  return sidechainFiles;
}

export type Tokens = { in: number; out: number };

export function applyEvent(
  sittings: Sitting[],
  event: string,
  now: number,
  tokens?: Tokens,
): Sitting[] {
  const earlier = sittings.slice(0, -1);
  const last = sittings[sittings.length - 1];
  const tokenFields = tokens
    ? { tokensIn: tokens.in, tokensOut: tokens.out }
    : {};

  if (event === "SessionStart")
    return [
      ...sittings,
      { start: now, turns: 0, end: "", tokensIn: 0, tokensOut: 0 },
    ];
  if (!last)
    return sittings;
  const isStop = event === "Stop";
  const isStopFailure = event === "StopFailure";
  const isStopEvent = isStop || isStopFailure;
  if (isStopEvent)
    return [...earlier, { ...last, turns: last.turns + 1, ...tokenFields }];
  if (event === "SessionEnd")
    return [...earlier, { ...last, end: now, ...tokenFields }];
  return sittings;
}

// Re-sums the whole transcript each time, so a race with the last write self-corrects next Stop.
export async function countTranscriptTokens(
  transcriptPath: string | undefined,
  scratchRoot: string,
): Promise<Tokens | undefined> {
  if (!transcriptPath)
    return undefined;
  let text: string;
  try {
    text = await readFile(transcriptPath, "utf8");
  }
  catch {
    return undefined;
  }

  // Claude Code re-logs a completed message more than once while streaming, same id, same usage each time.
  const seenIds = new Set<string>();
  let tokensIn = 0;
  let tokensOut = 0;
  const addLines = (body: string) => {
    for (const line of body.split("\n")) {
      if (!line)
        continue;
      let message:
        | {
          id?: string;
          usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          };
        }
        | undefined;
      try {
        message = JSON.parse(line)?.message;
      }
      catch {
        continue;
      }
      const usage = message?.usage;
      const hasNoUsage = !usage;
      if (hasNoUsage)
        continue;
      const messageId = message?.id;
      const hasNoId = !messageId;
      if (hasNoId)
        continue;
      const isAlreadySeen = seenIds.has(messageId);
      if (isAlreadySeen)
        continue;
      seenIds.add(messageId);
      tokensIn +=
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0);
      tokensOut += usage.output_tokens ?? 0;
    }
  };

  addLines(text);
  for (const path of await findSidechainPaths(transcriptPath, scratchRoot)) {
    try {
      addLines(await readFile(path, "utf8"));
    }
    catch {
      continue;
    }
  }
  return { in: tokensIn, out: tokensOut };
}

async function removeStaleCounters(now: number, keepDays: number, dir: string): Promise<void> {
  const cutoff = now - keepDays * 86400;
  for (const name of await readdir(dir)) {
    const isNotJson = !name.endsWith(".json");
    if (isNotJson)
      continue;
    const path = `${dir}/${name}`;
    const { mtimeMs } = await stat(path);
    if (mtimeMs / 1000 < cutoff)
      await unlink(path);
  }
}

if (import.meta.main) {
  let input: {
    hook_event_name?: string;
    session_id?: string;
    transcript_path?: string;
    stop_hook_active?: boolean;
    settings?: Record<string, string>;
  } = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  }
  catch {
    process.exit(0);
  }
  if (!input.session_id)
    process.exit(0);
  const scratchRoot = getSetting(input, "CLAUDE_HOOKS_STATUS_LINE_SCRATCH_ROOT");
  const keepDays = Number(getSetting(input, "CLAUDE_HOOKS_STATUS_LINE_KEEP_DAYS"));
  const isStopAfterStopHookBlock = input.hook_event_name === "Stop" && input.stop_hook_active === true;
  if (isStopAfterStopHookBlock)
    process.exit(0);

  const stateDir = getSetting(input, "CLAUDE_HOOKS_SESSION_STATE_DIR");
  const path = getSessionStatePath(input.session_id, stateDir);
  const now = Math.floor(Date.now() / 1000);

  if (input.hook_event_name === "SessionStart") {
    await mkdir(dirname(path), { recursive: true });
    await removeStaleCounters(now, keepDays, stateDir);
  }

  const tokens =
    input.hook_event_name === "SessionStart"
      ? undefined
      : await countTranscriptTokens(input.transcript_path, scratchRoot);
  const state = readSessionState(path);
  const updated = applyEvent(
    state.sittings ?? [],
    input.hook_event_name ?? "",
    now,
    tokens,
  );
  if (updated.length > 0) {
    state.sittings = updated;
    writeSessionState(path, state);
  }
}
