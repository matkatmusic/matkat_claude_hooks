#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const SETUP_SCRIPT = resolve(import.meta.dirname, "../worktreeSetup/newWorktree.sh");
const WORKTREE_ADD_PATTERN = /\bgit\b(\s+-C\s+\S+)?\s+worktree\s+add\b/;

type WorktreeAddCall = { repoFolder: string; branch: string };

function splitShellWords(command: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote = "";
  for (const character of command) {
    const isClosingQuote = quote !== "" && character === quote;
    const isInsideQuote = quote !== "";
    const isOpeningQuote = character === "'" || character === "\"";
    const isSpace = /\s/.test(character);
    if (isClosingQuote) {
      quote = "";
    }
    else if (isInsideQuote) {
      word += character;
    }
    else if (isOpeningQuote) {
      quote = character;
    }
    else if (isSpace) {
      if (word !== "")
        words.push(word);
      word = "";
    }
    else {
      word += character;
    }
  }
  if (word !== "")
    words.push(word);
  return words;
}

// Returns undefined when the command is not one plain call the setup script can replace.
function parseWorktreeAddCall(command: string, cwd: string): WorktreeAddCall | undefined {
  const joinsCommands = /[&;|\n]/.test(command);
  if (joinsCommands)
    return undefined;
  const words = splitShellWords(command);
  let repoFolder = cwd;
  let index = words.indexOf("git") + 1;
  if (words[index] === "-C") {
    repoFolder = resolve(cwd, words[index + 1]);
    index += 2;
  }
  index += 2;
  let branch = "";
  const positionals: string[] = [];
  for (; index < words.length; index++) {
    const word = words[index];
    const takesBranch = word === "-b" || word === "-B";
    const isFlag = word.startsWith("-");
    if (takesBranch) {
      index++;
      branch = words[index];
    }
    else if (!isFlag) {
      positionals.push(word);
    }
  }
  if (positionals.length !== 1)
    return undefined;
  if (branch === "")
    branch = basename(positionals[0]);
  return { repoFolder, branch };
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const command: string = input.tool_input?.command ?? "";
  const runsWorktreeAdd = WORKTREE_ADD_PATTERN.test(command);
  if (!runsWorktreeAdd)
    process.exit(0);
  const call = parseWorktreeAddCall(command, input.cwd);
  const hasCall = call !== undefined;
  if (hasCall) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          permissionDecisionReason: `The command was swapped for the setup script ${SETUP_SCRIPT}. The worktree path is printed on stdout.`,
          updatedInput: { ...input.tool_input, command: `${SETUP_SCRIPT} '${call.repoFolder}' '${call.branch}'` },
        },
      }),
    );
  }
  else {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `Make worktrees only with the setup script: ${SETUP_SCRIPT} <repo folder> <branch>. It fills the submodules, copies settings, and installs packages.`,
        },
      }),
    );
  }
}
