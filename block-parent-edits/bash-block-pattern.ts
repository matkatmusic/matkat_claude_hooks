import { isBashContentWrite } from "../shared/bash-content-write.ts";

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
const sameCommandChars = matchNoneOf("|;&") + zeroOrMore;
// const outputFlag = assertNoLookbehind(wordBoundary + toolsWhoseOutputFlagIsNotAFile) + whitespace + "-o" + whitespacePlus + nonWhitespace + oneOrMore;
const outputFlag = assertNoLookbehind(wordBoundary + toolsWhoseOutputFlagIsNotAFile + wordBoundary + sameCommandChars) + whitespace + "-o" + whitespacePlus + nonWhitespace + oneOrMore;

// Blocks `sd` and `sed -i`; `sd` right after a single pipe (e.g. "ls | sd a b") is excused.
const singlePipeBoundary = assertNoLookbehind("\\|") + "\\|" + whitespaceStar;
const sdNotRightAfterSinglePipe = assertNoLookbehind(singlePipeBoundary);
const sdOrSedInPlace = matchAnyOf(sdNotRightAfterSinglePipe + wordBoundary + "sd" + wordBoundary, wordBoundary + "sed" + whitespacePlus + "-i");

// `tee` writes its stdin to a file while piping it through. e.g. "echo hi | tee f.txt".
const teeCommand = wordBoundary + "tee" + wordBoundary;

const IDLE_STATE_REDIRECT = />{1,2}\s*["']?\S*\/\.idleState\/[^\s"']*["']?/g;

const BASH_BLOCK_PATTERN = new RegExp(matchAnyOf(redirectToFile, heredoc, fileCommand, outputFlag, sdOrSedInPlace, teeCommand));
// isBashContentWrite now lives in ../shared/bash-content-write.ts

export function isBashCommandBlocked(command: string): boolean {
  const commandWithoutIdleStateWrites = command.replace(IDLE_STATE_REDIRECT, "");
  const strippedCommand = commandWithoutIdleStateWrites.replace(/'[^']*'|"[^"]*"/g, "");
  const isPatternBlocked = BASH_BLOCK_PATTERN.test(strippedCommand);
  const isSharedBashEdit = isBashContentWrite(commandWithoutIdleStateWrites);
  return isPatternBlocked || isSharedBashEdit;
}
