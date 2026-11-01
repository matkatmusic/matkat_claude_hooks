// Direct rows 29, 30 test status-line on the bed clone with crafted input. Row 31 is live row 64.
import { type DirectContext, type DirectResult, buildResult, formatFlag, executeHook } from "./stranger_direct_support.ts";

const STATUS_SCRIPT = "status-line/status.ts";

function executeStatus(context: DirectContext, sessionId: string, displayName: string) {
  const input = { session_id: sessionId, model: { id: "x", display_name: displayName }, workspace: { current_dir: context.direct } };
  return executeHook(context, STATUS_SCRIPT, input, context.direct);
}

export function validateStatusTurnCounterNotWired(context: DirectContext): DirectResult {
  const run = executeStatus(context, "direct-status-unwired", "Opus 5");
  const countersLine = run.stdout.split("\n")[1];
  const namesProblem = countersLine.includes("turn-counter hook is not wired");
  const hidesTokens = !countersLine.includes("Tokens In:");
  const ok = run.status === 0 && namesProblem && hidesTokens;
  return buildResult(29, "status-line (no counter)", ok, `exit ${run.status}; line 2 names the missing turn-counter hook: ${formatFlag(namesProblem)}; no fake "0 turns" or token numbers: ${formatFlag(hidesTokens)}`);
}

export function validateStatusUnknownModel(context: DirectContext): DirectResult {
  const run = executeStatus(context, "direct-status-model", "Nova 9");
  const lines = run.stdout.split("\n");
  const namesModel = lines[0].includes("Nova 9");
  const hasRed = lines[0].includes("\x1b[31m");
  const keepsOtherLines = lines.length > 2;
  const ok = run.status === 0 && namesModel && hasRed && keepsOtherLines;
  return buildResult(30, "status-line (model)", ok, `exit ${run.status}; line 1 shows "Nova 9" in red: ${formatFlag(namesModel && hasRed)}; the other lines still print: ${formatFlag(keepsOtherLines)}`);
}

// Moved to live row 64 in run_stranger.ts.
