#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { isBashContentWrite } from "../shared/bash-content-write.ts";
// PreToolUse: blocks Bash commands that write file content, in every session. Use Edit/Write instead.

// Both patterns now live in ../shared/bash-content-write.ts
// const quotedText = /'[^']*'|"[^"]*"/g;
// const fdRedirectToFile = /(?<=^|\s)\d>{1,2}\s*(?!\s*(?:&|\/dev\/null))/;
// const pythonInlineCode = /\bpython[\d.]*\s+-c\b/;
//
// export function isBashEdit(command: string): boolean {
//   const isSharedContentWrite = isBashContentWrite(command);
//   if (isSharedContentWrite) {
//     return true;
//   }
//   const strippedCommand = command.replace(quotedText, "");
//   const hasFdRedirectToFile = fdRedirectToFile.test(strippedCommand);
//   const hasPythonInlineCode = pythonInlineCode.test(strippedCommand);
//   return hasFdRedirectToFile || hasPythonInlineCode;
// }

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
