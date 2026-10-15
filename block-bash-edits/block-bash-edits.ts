#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isBashContentWrite } from "../shared/bash-content-write.ts";
// PreToolUse: blocks Bash commands that write file content, in every session. Use Edit/Write instead.

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isBash = input.tool_name === "Bash";
  const isContentWrite = isBashContentWrite(input.tool_input?.command ?? "");
  const shouldDeny = isBash && isContentWrite;
  if (shouldDeny) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: "Use the Edit/Write tools to modify files. Do not use Bash (sed, cat >, heredocs, tee, python -c) to write files. The debt-ratchet and style hooks only watch Edit/Write.",
        },
      }),
    );
  }
}
