#!/usr/bin/env node
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readEnvValue } from "../shared/env.ts";
// PreToolUse: blocks file edits from the parent (claude-fable-* or claude-opus-5*) session. Subagents may edit.

// --- regex token vocabulary (jfred's regex_expressions.ts style: named source-string fragments, composed with
// `+`, wrapped in `new RegExp(...)` only at the end) -------------------------------------------------------
const startAnchor = "^";     // matches the start position
const wordBoundary = "\\b";  // a transition between a word char and a non-word char
const wordChar = "\\w";      // one word char: letter, digit, or underscore
const whitespace = "\\s";    // one whitespace char
const nonWhitespace = "\\S"; // one NON-whitespace char
const digit = "\\d";         // one digit, 0-9
const oneOrMore = "+";       // one or more of the token immediately before it
const zeroOrMore = "*";      // zero or more of the token immediately before it

const whitespaceStar = whitespace + zeroOrMore; // `\s*` — optional spaces
const whitespacePlus = whitespace + oneOrMore;  // `\s+` — a run of spaces

const matchNoneOf = (chars: string): string => "[^" + chars + "]"; // a negated character class `[^…]`
const assertNoLookahead = (inner: string): string => "(?!" + inner + ")";   // inner must NOT follow
const assertNoLookbehind = (inner: string): string => "(?<!" + inner + ")"; // inner must NOT precede
// One of several alternative fragments `(?:a|b|c)`, built with a for loop rather than `.join("|")`.
function matchAnyOf(...alternatives: string[]): string {
  let combined = "";
  for (let i = 0; i < alternatives.length; i++) {
    if (i > 0)
      combined += "|";
    combined += alternatives[i];
  }
  return "(?:" + combined + ")";
}

// A `>`/`>>` redirect to a real file, excluding `>/dev/null` and `>&` (fd dups like `2>&1`).
const redirectToFile =
  matchNoneOf("<>&" + digit) + assertNoLookahead(">{1,2}" + whitespaceStar + "/dev/null") + ">{1,2}" + assertNoLookahead("&");

// A heredoc start: `<<` then a word char, so it still matches once quotes around the delimiter are stripped.
const heredoc = "<<" + whitespaceStar + wordChar + oneOrMore;

// `cp`/`mv`/`rm`/`mkdir`/`touch`/`chmod` as a command: at the start, or right after `&&`/`||`/`;`/`|`.
const commandBoundaryOperators = matchAnyOf(startAnchor, "&&", "\\|\\|", ";", "\\|");
const fileMutatingCommandNames = matchAnyOf("cp", "mv", "rm", "mkdir", "touch", "chmod");
const fileCommand = commandBoundaryOperators + whitespaceStar + fileMutatingCommandNames + wordBoundary;

// A CLI `-o <path>` output flag that writes a file, excused right after `rg`/`grep` (their `-o` means something else).
const toolsWhoseOutputFlagIsNotAFile = matchAnyOf("rg", "grep");
const outputFlag = assertNoLookbehind(wordBoundary + toolsWhoseOutputFlagIsNotAFile) + whitespace + "-o" + whitespacePlus + nonWhitespace + oneOrMore;

// Blocks `sd` and `sed -i`; `sd` right after a single pipe (e.g. "ls | sd a b") is excused.
const singlePipeBoundary = assertNoLookbehind("\\|") + "\\|" + whitespaceStar;
const sdNotRightAfterSinglePipe = assertNoLookbehind(singlePipeBoundary);
const sdOrSedInPlace = matchAnyOf(sdNotRightAfterSinglePipe + wordBoundary + "sd" + wordBoundary, wordBoundary + "sed" + whitespacePlus + "-i");

// `tee` writes its stdin to a file while piping it through. e.g. "echo hi | tee f.txt".
const teeCommand = wordBoundary + "tee" + wordBoundary;

const BASH_BLOCK_PATTERN = new RegExp(matchAnyOf(redirectToFile, heredoc, fileCommand, outputFlag, sdOrSedInPlace, teeCommand));
// isBashContentWrite now lives in ../shared/bash-content-write.ts
// const BASH_CONTENT_WRITE_PATTERN = new RegExp(matchAnyOf(redirectToFile, heredoc, outputFlag, sdOrSedInPlace, teeCommand));

export function isBlockedParentModel(transcriptPath: string): boolean {
  const lines = readFileSync(transcriptPath, "utf8").split("\n");
  let model = "";
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i])
      continue;
    const entry = JSON.parse(lines[i]);
    const isAssistantWithModel = entry.type === "assistant" && entry.message?.model;
    if (isAssistantWithModel)
      model = entry.message.model;
    const isModelAttachment = entry.type === "attachment" && entry.attachment?.type === "model" && entry.attachment.identity?.modelId;
    if (isModelAttachment)
      model = entry.attachment.identity.modelId;
  }
  const isFable = model.startsWith("claude-fable");
  const isOpus5 = model.startsWith("claude-opus-5");
  return isFable || isOpus5;
}

export function isBashCommandBlocked(command: string): boolean {
  const strippedCommand = command.replace(/'[^']*'|"[^"]*"/g, "");
  return BASH_BLOCK_PATTERN.test(strippedCommand);
}

// export function isBashContentWrite(command: string): boolean {
//   const strippedCommand = command.replace(/'[^']*'|"[^"]*"/g, "");
//   return BASH_CONTENT_WRITE_PATTERN.test(strippedCommand);
// }

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const isSubagent = typeof input.agent_id === "string" || typeof input.agent_type === "string";
  const subagentModel = process.env.CLAUDE_CODE_SUBAGENT_MODEL ?? "";
  const isFableSubagent = isSubagent && subagentModel.startsWith("claude-fable");
  const isBlockedModelParent = !isSubagent && isBlockedParentModel(input.transcript_path);
  const parentInPlanMode = input.permission_mode === "plan";
  const isBlockedParent = isBlockedModelParent && !parentInPlanMode;

  const denyRules: { blocked: boolean; reason: string }[] = [
    { blocked: isFableSubagent, reason: "Fable subagents must not edit files. Fable should never edit code.  Change the CLAUDE_CODE_SUBAGENT_MODEL in the global .claude/settings.json environment variable to something other than a Fable model." },
    { blocked: isBlockedParent, reason: "Parent session must not edit files. Delegate the edit to a subagent." },
  ];

  let denyReason = "";
  for (let i = 0; i < denyRules.length; i++) {
    if (denyRules[i].blocked) {
      denyReason = denyRules[i].reason;
      break;
    }
  }

  if (!denyReason)
    process.exit(0);

  const toolName = input.tool_name;
  let blocked = toolName === "Edit" || toolName === "Write" || toolName === "NotebookEdit";
  if (toolName === "Bash")
    blocked = isBashCommandBlocked(input.tool_input?.command ?? "");

  if (blocked) {
    let finalDenyReason = denyReason;
    if (isBlockedParent) {
      const dir = readEnvValue("CLAUDE_HOOKS_BLOCKED_EDITS_DIR");
      mkdirSync(dir, { recursive: true });
      const savedPath = join(dir, `${input.session_id}-${Date.now()}.json`);
      writeFileSync(savedPath, JSON.stringify(input.tool_input, null, 2));
      finalDenyReason = `${denyReason} Your blocked tool call is saved at ${savedPath} (JSON of the tool input). Tell the subagent to read that file and apply it. Do not repeat its content in the prompt. Keep the prompt short: file paths, the change, how to check it. No background.`;
    }
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: finalDenyReason,
        },
      }),
    );
  }
}