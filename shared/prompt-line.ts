// jfred's isGenuineUserPrompt: hook feedback (isMeta) and tool results are not prompts.
export function isPromptLine(entry: {
  type?: string;
  isMeta?: boolean;
  origin?: { kind?: string };
  message?: { content?: unknown };
}): boolean {
  // Assistant replies and system records are never prompts.
  if (entry.type !== "user")
    return false;
  // A typed or queued human message is always a prompt, even one carrying a tool result.
  if (entry.origin?.kind === "human")
    return true;
  // Any other origin (task-notification from a subagent, peer session message) is not a prompt.
  if (entry.origin?.kind !== undefined)
    return false;
  // Hook feedback and injected context are marked isMeta; skip them.
  if (entry.isMeta === true)
    return false;
  const content = entry.message?.content;
  const blocks = Array.isArray(content) ? (content as { type?: string }[]) : [];
  let hasToolResult = false;
  for (const block of blocks) {
    const isToolResult = block.type === "tool_result";
    if (isToolResult)
      hasToolResult = true;
  }
  return !hasToolResult;
}
