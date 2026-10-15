// Drops heredoc bodies: the lines after a <<TAG line, up to and including the closing TAG line.
export function removeHeredocs(command: string): string {
  const lines = command.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    kept.push(lines[i]);
    const tag = lines[i].match(/<<(-?)\s*(['"]?)(\w+)\2/);
    if (!tag)
      continue;
    const stripsLeadingTabs = tag[1] === "-";
    const closingTag = tag[3];
    while (true) {
      i++;
      const isPastEnd = i >= lines.length;
      if (isPastEnd)
        break;
      const candidate = stripsLeadingTabs ? lines[i].replace(/^\t+/, "") : lines[i];
      const isClosingLine = candidate === closingTag;
      if (isClosingLine)
        break;
    }
  }
  return kept.join("\n");
}

// Splits a shell line into simple commands at unquoted separators or newlines; strips quotes, keeps their text.
export function splitSimpleCommands(shellLine: string): string[][] {
  const command = removeHeredocs(shellLine);
  const commands: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const isBackslash = ch === "\\";
    const isSingleQuoteChar = ch === "'";
    const isDoubleQuoteChar = ch === '"';
    const isQuoteChar = isSingleQuoteChar || isDoubleQuoteChar;
    const isSeparator = ";&|()`\n".includes(ch);
    if (quote) {
      const isInsideDoubleQuote = quote === '"';
      const isEscapeInsideDoubleQuote = isBackslash && isInsideDoubleQuote;
      if (ch === quote)
        quote = null;
      else if (isEscapeInsideDoubleQuote)
        current += command[++i] ?? "";
      else
        current += ch;
    }
    else if (isBackslash)
      current += command[++i] ?? "";
    else if (isQuoteChar)
      quote = ch;
    else if (isSeparator) {
      commands.push(current);
      current = "";
    }
    else
      current += ch;
  }
  commands.push(current);
  const result: string[][] = [];
  for (let i = 0; i < commands.length; i++) {
    const rawWords = commands[i].trim().split(/\s+/);
    const words: string[] = [];
    for (let j = 0; j < rawWords.length; j++) {
      const isEmpty = rawWords[j] === "";
      if (!isEmpty)
        words.push(rawWords[j]);
    }
    const hasWords = words.length > 0;
    if (hasWords)
      result.push(words);
  }
  return result;
}
