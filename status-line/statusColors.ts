import { readEnvValue } from "../shared/env.ts";

export const CYAN ="\x1b[36m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const ORANGE = "\x1b[38;5;208m";
export const RED = "\x1b[31m";
export const GREY = "\x1b[90m";
export const RESET = "\x1b[0m";

export const DASH = `${GREY}-${RESET}`;

export function formatOrDash<T>(value: T | undefined, render: (value: T) => string): string {
  return value === undefined ? DASH : render(value);
}

export function selectColor(value: number, yellowAt: number, orangeAt: number, redAt: number): string {
  if (value >= redAt)
    return RED;
  if (value >= orangeAt)
    return ORANGE;
  if (value >= yellowAt)
    return YELLOW;
  return GREEN;
}

// Loudness tracks the points left before the day's budget, not the fraction of it spent
export function selectWeeklyUsageColor(usedPercent: number, budgetPercent: number): string {
  const pointsLeft = budgetPercent - usedPercent;
  if (pointsLeft < Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RED_POINTS_LEFT")))
    return RED;
  if (pointsLeft < Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_ORANGE_POINTS_LEFT")))
    return ORANGE;
  if (pointsLeft < Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_YELLOW_POINTS_LEFT")))
    return YELLOW;
  return GREEN;
}

export function selectBudgetColor(usedPercent: number | undefined, budgetPercent: number): string {
  return usedPercent !== undefined && usedPercent >= budgetPercent ? RED : "";
}
