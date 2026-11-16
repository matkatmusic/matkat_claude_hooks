const CHAT_BUSY_PATTERN = /…\s*\(\d+[ms]/;

export function hasOpenDialog(screen: string): boolean {
  const screenWithoutWhiteSpace = screen.replace(/\s/g, "");
  return screenWithoutWhiteSpace.includes("Esctocancel");
}

export function inputBoxHoldsMessage(screen: string, text: string): boolean {
  const lines = screen.split("\n");
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex--) {
    const line = lines[lineIndex];
    if (line.trimStart().startsWith("❯")) {
      const textStart = text.split("\n")[0].slice(0, 20);
      const lineHoldsTextStart = line.includes(textStart);
      const lineShowsPastedTextMarker = line.includes("[Pasted text");
      const boxWithoutWhiteSpace = lines.slice(lineIndex).join("").replace(/\s/g, "");
      const boxHoldsTextEnd = boxWithoutWhiteSpace.includes(text.replace(/\s/g, "").slice(-20));
      const inputBoxHoldsText = lineHoldsTextStart || lineShowsPastedTextMarker || boxHoldsTextEnd;
      return inputBoxHoldsText;
    }
  }
  return false;
}

export function isChatBusy(screen: string): boolean {
  const screenShowsBusyLine = CHAT_BUSY_PATTERN.test(screen);
  return screenShowsBusyLine;
}

export function isInputBoxEmpty(screen: string): boolean {
  const lines = screen.split("\n");
  for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex--) {
    const line = lines[lineIndex];
    if (line.trimStart().startsWith("❯")) {
      const textAfterPrompt = line.trimStart().slice(1);
      const inputBoxHoldsNothing = textAfterPrompt.trim() === "";
      return inputBoxHoldsNothing;
    }
  }
  return false;
}

export function hasBackgroundWorkDialog(screen: string): boolean {
  const screenWithoutWhiteSpace = screen.replace(/\s/g, "");
  const screenShowsBackgroundWorkDialog = screenWithoutWhiteSpace.includes("Backgroundworkisrunning");
  return screenShowsBackgroundWorkDialog;
}
