#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, extname } from "node:path";
import { buildHookOutput } from "./output.ts";
import { readSettings, isEnabled, getValues, getHooks, DISPATCHER_DIR, type HookEntry, type Settings } from "../shared/settings.ts";
// Runs the hooks in the list for one event and merges their outputs.

export { type HookEntry, buildHookOutput };

const HOME = process.env.HOME;

export function executeHooks(input: any, hooks: HookEntry[], settings: { defaults: Settings; user: Settings }): string {
  const event = input.hook_event_name;
  let currentInput = input;
  let updatedInput: any;
  let rank: "none" | "allow" | "ask" | "deny" = "none";
  let continueFalse = false;
  const reasons: string[] = [];
  const askReasons: string[] = [];
  const contexts: string[] = [];
  const systemMessages: string[] = [];

  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    const isSameEvent = hook.event === event;
    if (!isSameEvent)
      continue;
    const scriptPath = hook.command[hook.command.length - 1];
    const name = basename(scriptPath, extname(scriptPath));
    const hookEnabled = isEnabled(settings, name, event);
    if (!hookEnabled)
      continue;
    const hasMatcher = hook.matcher !== undefined;
    if (hasMatcher) {
      const matcherRegex = new RegExp(hook.matcher as string);
      const matches = matcherRegex.test(currentInput.tool_name ?? "");
      if (!matches)
        continue;
    }

    const timeoutSeconds = hook.timeout ?? 60;
    let cwd = input.cwd;
    const sessionDirectoryExists = existsSync(input.cwd);
    if (!sessionDirectoryExists) {
      cwd = HOME as string;
      const lastCommandPart = hook.command[hook.command.length - 1];
      const hookName = basename(lastCommandPart);
      const deletedDirectoryMessage = `\nhook ${hookName} errored! \n\nThe hook ran from this folder instead:\n${HOME} \nThe following session directory was deleted:\n${input.cwd}`;
      systemMessages.push(deletedDirectoryMessage);
    }
    const result = spawnSync(hook.command[0], hook.command.slice(1), {
      input: JSON.stringify({ ...currentInput, settings: getValues(settings, name) }),
      encoding: "utf8",
      timeout: timeoutSeconds * 1000,
      env: process.env,
      cwd,
    });
    if (result.error) {
      console.error(`hook spawn failed, cwd: ${input.cwd}`);
      throw result.error;
    }

    const isBlockExit = result.status === 2;
    if (isBlockExit)
      reasons.push(result.stderr.trim());
    const isOtherFailure = result.status !== 0 && result.status !== 2;
    if (isOtherFailure) {
      const name = basename(hook.command[hook.command.length - 1]);
      systemMessages.push(`[hook ${name} failed, exit ${result.status}] ${result.stderr.trim()}`);
    }

    const stdout = result.stdout.trim();
    const isEmptyStdout = stdout.length === 0;
    const isJsonStdout = stdout.startsWith("{");
    const hasJsonOutput = !isEmptyStdout && isJsonStdout;
    if (hasJsonOutput) {
      const parsed = JSON.parse(stdout);
      const hasContinueFalse = parsed.continue === false;
      if (hasContinueFalse) {
        continueFalse = true;
        if (parsed.stopReason)
          systemMessages.push(parsed.stopReason);
      }
      const isBlockDecision = parsed.decision === "block";
      if (isBlockDecision)
        reasons.push(parsed.reason);
      if (parsed.systemMessage)
        systemMessages.push(parsed.systemMessage);

      const specific = parsed.hookSpecificOutput;
      const hasAdditionalContext = specific?.additionalContext !== undefined;
      if (hasAdditionalContext)
        contexts.push(specific.additionalContext);

      const permissionDecision = specific?.permissionDecision;
      if (permissionDecision === "deny") {
        reasons.push(specific.permissionDecisionReason);
        rank = "deny";
      }
      else if (permissionDecision === "ask") {
        askReasons.push(specific.permissionDecisionReason);
        const alreadyDeny = rank === "deny";
        if (!alreadyDeny)
          rank = "ask";
      }
      else if (permissionDecision === "allow") {
        const alreadyAskOrDeny = rank === "ask" || rank === "deny";
        if (!alreadyAskOrDeny)
          rank = "allow";
      }

      const hasUpdatedInput = specific?.updatedInput !== undefined;
      if (hasUpdatedInput) {
        updatedInput = specific.updatedInput;
        currentInput = { ...currentInput, tool_input: updatedInput };
      }
    }
    else if (!isEmptyStdout) {
      contexts.push(stdout);
    }
  }

  return buildHookOutput(event, reasons, askReasons, contexts, systemMessages, rank, updatedInput, continueFalse);
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const settings = readSettings(DISPATCHER_DIR);
  const result = executeHooks(input, getHooks(settings), settings);
  const isSessionEnd = input.hook_event_name === "SessionEnd";
  let systemMessage;
  const hasResult = result !== "";
  if (hasResult) {
    const parsedResult = JSON.parse(result);
    systemMessage = parsedResult.systemMessage;
  }
  const hasSystemMessage = Boolean(systemMessage);
  let shouldBlockSessionEnd = false;
  if (isSessionEnd)
    shouldBlockSessionEnd = hasSystemMessage;
  if (shouldBlockSessionEnd) {
    console.error(systemMessage);
    process.exit(2);
  }
  if (result)
    console.log(result);
  process.exit(0);
}
