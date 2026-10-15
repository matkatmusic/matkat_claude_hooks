// Builds the merged hook output JSON for one event.
export function buildHookOutput(
  event: string,
  reasons: string[],
  askReasons: string[],
  contexts: string[],
  systemMessages: string[],
  rank: "none" | "allow" | "ask" | "deny",
  updatedInput: any,
  continueFalse: boolean,
): string {
  const output: any = {};
  const contextText = contexts.join("\n\n");
  const isPreToolUse = event === "PreToolUse";
  const isBlockable = event === "Stop" || event === "SubagentStop" || event === "PostToolUse" || event === "UserPromptSubmit";

  if (isPreToolUse) {
    const hookSpecificOutput: any = { hookEventName: event };
    const hasReasons = reasons.length > 0;
    const hasAskReasons = askReasons.length > 0;
    const hasUpdatedInput = updatedInput !== undefined;
    const isAllowRank = rank === "allow";
    const shouldAllow = isAllowRank || hasUpdatedInput;
    if (hasReasons) {
      hookSpecificOutput.permissionDecision = "deny";
      hookSpecificOutput.permissionDecisionReason = reasons.join("\n\n");
    }
    else if (hasAskReasons) {
      hookSpecificOutput.permissionDecision = "ask";
      hookSpecificOutput.permissionDecisionReason = askReasons.join("\n\n");
    }
    else if (shouldAllow) {
      hookSpecificOutput.permissionDecision = "allow";
    }
    if (hasUpdatedInput)
      hookSpecificOutput.updatedInput = updatedInput;
    if (contexts.length > 0)
      hookSpecificOutput.additionalContext = contextText;

    const hasPermissionDecision = hookSpecificOutput.permissionDecision !== undefined;
    const hasContext = hookSpecificOutput.additionalContext !== undefined;
    const hasSomethingToReport = hasPermissionDecision || hasContext;
    if (hasSomethingToReport)
      output.hookSpecificOutput = hookSpecificOutput;
  }
  else if (isBlockable) {
    const hasReasons = reasons.length > 0;
    if (hasReasons) {
      output.decision = "block";
      output.reason = reasons.join("\n\n");
    }
    if (contexts.length > 0)
      output.hookSpecificOutput = { hookEventName: event, additionalContext: contextText };
  }
  else {
    if (reasons.length > 0)
      systemMessages.push(reasons.join("\n\n"));
    if (contexts.length > 0)
      output.hookSpecificOutput = { hookEventName: event, additionalContext: contextText };
  }

  if (systemMessages.length > 0)
    output.systemMessage = systemMessages.join("\n\n");
  if (continueFalse) {
    output.continue = false;
    output.stopReason = systemMessages.join("\n\n");
  }

  const hasOutput = Object.keys(output).length > 0;
  return hasOutput ? JSON.stringify(output) : "";
}
