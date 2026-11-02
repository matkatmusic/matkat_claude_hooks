import { writeFileSync } from "node:fs";
import path from "node:path";
import { tmux_lib } from "./external/tmux_lib/tmux_lib.ts";
import { CONTEXT_PERCENT_RE, CONTEXT_WARNING_RE, FILLER_COLUMNS, FILLER_FILES, FILLER_LINES, TOAST_BOX_RE, TOAST_GONE_WAIT_S, TOAST_POLL_S } from "./stranger_constants.ts";

export function getPaneContextPercent(name: string): number {
  const found = CONTEXT_PERCENT_RE.exec(tmux_lib.tmux_capturePane(name));
  if (found === null) {
    throw new Error(`no context percent on the screen of pane ${name}`);
  }
  return Number(found[1]);
}

// The context-exit mod keeps its latest warning on the status line, so the screen shows the last level.
export function readWarningLevel(screen: string): number | null {
  for (const line of screen.split("\n")) {
    const isWarningLine = line.includes("context-exit:");
    if (!isWarningLine) {
      continue;
    }
    const found = CONTEXT_WARNING_RE.exec(line);
    if (found !== null) {
      return Number(found[1]);
    }
  }
  return null;
}

function createFillerWord(fileIndex: number, line: number, column: number): string {
  let number = (line * 7919 + column * 104729 + fileIndex * 1000003 + 12345) % 11881376;
  let word = "";
  for (let letter = 0; letter < 5; letter++) {
    word += String.fromCharCode(97 + (number % 26));
    number = Math.floor(number / 26);
  }
  return word;
}

export function writeFillerFiles(project: string): void {
  for (let fileIndex = 1; fileIndex <= FILLER_FILES; fileIndex++) {
    let text = "";
    for (let line = 0; line < FILLER_LINES; line++) {
      const words: string[] = [];
      for (let column = 0; column < FILLER_COLUMNS; column++) {
        words.push(createFillerWord(fileIndex, line, column));
      }
      text += words.join(" ") + "\n";
    }
    writeFileSync(path.join(project, `filler${fileIndex}.txt`), text);
  }
}

export function waitForToastGone(name: string): void {
  for (let waited = 0; waited < TOAST_GONE_WAIT_S; waited += TOAST_POLL_S) {
    const hasToast = TOAST_BOX_RE.test(tmux_lib.tmux_capturePane(name));
    if (!hasToast) {
      return;
    }
    tmux_lib.sleep(TOAST_POLL_S);
  }
  throw new Error(`the context-exit toast stayed on the screen of pane ${name}`);
}
