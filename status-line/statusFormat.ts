import { RESET, selectColor } from "./statusColors.ts";
import { readEnvValue } from "../shared/env.ts";

export function formatTokens(n: number): string {
  if (n >= 1e6)
    return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3)
    return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.floor(n));
}

export function formatBar(percent: number): string {
  const filled = Math.min(10, Math.max(0, Math.floor(percent / 10)));
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

export function formatCountdown(seconds: number): string {
  const total = Math.floor(seconds / 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// resets_at is epoch seconds from rate-limit headers, but ISO 8601 elsewhere
export function computeSecondsUntilReset(resetsAt: number | string | undefined, now: number): number {
  const isMissing = resetsAt === undefined;
  if (isMissing)
    return 0;
  const isEmpty = resetsAt === "";
  if (isEmpty)
    return 0;
  const epoch = typeof resetsAt === "number" ? resetsAt : Date.parse(resetsAt) / 1000;
  return Number.isFinite(epoch) ? Math.floor(epoch - now) : 0;
}

export function computeDayOfWeek(secondsUntilWeeklyReset: number): number {
  const daysLeft = Math.floor(secondsUntilWeeklyReset / 86400);
  return Math.min(7, Math.max(1, 7 - daysLeft));
}

// The day number ticks up at every 24-hour boundary of the weekly window
export function computeSecondsUntilNextDay(secondsUntilWeeklyReset: number): number {
  return secondsUntilWeeklyReset % 86400;
}

export function computeWeeklyBudget(day: number): number {
  return (100 / 7) * day;
}

// The nearer the weekly reset, the better the news, so the countdown cools toward green
export function formatWeeklyResetSuffix(day: number, secondsLeft: number): string {
  if (day !== 7)
    return "";
  if (secondsLeft <= 0)
    return "";
  if (secondsLeft > Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_SHOW_HOURS")) * 3600)
    return "";
  const color = selectColor(
    Math.floor(secondsLeft / 60),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_YELLOW_MINUTES")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_ORANGE_MINUTES")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_RED_MINUTES")),
  );
  return ` (Resets in: ${color}${formatCountdown(secondsLeft)}${RESET})`;
}
