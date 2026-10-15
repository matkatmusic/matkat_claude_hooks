#!/usr/bin/env node
// Claude Code status line. Docs: code.claude.com/docs/en/statusline
import { existsSync, readFileSync } from "node:fs";
import { readEnvValue } from "../shared/env.ts";
import { EFFORT_ABBREVIATION, formatShortModelName } from "./statusShared.ts";
import { CYAN, DASH, GREEN, RED, RESET, formatOrDash, selectColor, selectBudgetColor, selectWeeklyUsageColor } from "./statusColors.ts";
import { resetColor } from "./statusAnnoyance.ts";
import { computeWeeklyBudget, computeDayOfWeek, formatBar, formatCountdown, formatTokens, computeSecondsUntilNextDay, computeSecondsUntilReset, formatWeeklyResetSuffix } from "./statusFormat.ts";
import { countTurns, getGitBranch, getSessionTokens, readSittings } from "./statusRead.ts";
import type { StatusInput } from "./statusRead.ts";

export { CYAN, DASH, RESET, formatOrDash, selectColor, selectBudgetColor, selectWeeklyUsageColor } from "./statusColors.ts";
export { ANNOYANCE_COLORS, computeAnnoyanceLevel, resetColor } from "./statusAnnoyance.ts";
export { computeWeeklyBudget, computeDayOfWeek, formatBar, formatCountdown, formatTokens, computeSecondsUntilNextDay, computeSecondsUntilReset, formatWeeklyResetSuffix } from "./statusFormat.ts";
export { countTurns, getSessionTokens } from "./statusRead.ts";

// const EFFORT_ABBREVIATION = { low: "L", medium: "M", high: "H", xhigh: "x", max: "max" };

function joinLine(...chunks: string[]): string {
  const parts: string[] = [];
  for (const chunk of chunks) {
    const hasContent = Boolean(chunk);
    if (hasContent)
      parts.push(chunk);
  }
  return parts.join(" | ");
}

if (import.meta.main) {
  let input: StatusInput = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  }
  catch {
    process.exit(0);
  }

  const projectDir = input.workspace?.current_dir;
  const dirDeleted = projectDir !== undefined && !existsSync(projectDir);
  if (dirDeleted) {
    console.log(`${RED}**** This session's directory was deleted!!! ****${RESET}`);
    process.exit(0);
  }

  const context = input.context_window ?? {};
  const limits = input.rate_limits ?? {};
  const pct = Math.floor(context.used_percentage ?? 0);
  // const sittings = await readSittings(input.session_id);
  const sittings = readSittings(input.transcript_path ?? input.session_id);
  const tokens = getSessionTokens(sittings);
  const tokensIn = tokens?.in;
  const tokensOut = tokens?.out;
  const fiveHour = limits.five_hour?.used_percentage;
  const sevenDay = limits.seven_day?.used_percentage;
  const turnCount = countTurns(sittings);

  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = computeSecondsUntilReset(limits.five_hour?.resets_at, now);
  const weeklyResetsAt = limits.seven_day?.resets_at;
  const weeklySecondsLeft = computeSecondsUntilReset(weeklyResetsAt, now);
  const weekDay = weeklyResetsAt === undefined ? undefined : computeDayOfWeek(weeklySecondsLeft);
  const weekBudget = weekDay === undefined ? undefined : computeWeeklyBudget(weekDay);
  const untilReset = secondsLeft > 0 ? secondsLeft : undefined;
  const nextDaySuffix =
    weekBudget === undefined || sevenDay === undefined || weekDay === 7
      ? ""
      : ` (next: ${selectWeeklyUsageColor(sevenDay, weekBudget)}${formatCountdown(computeSecondsUntilNextDay(weeklySecondsLeft))}${RESET})`;
  const spentOfWeek =
    weekBudget === undefined
      ? DASH
      : formatOrDash(sevenDay, (used) => `${selectWeeklyUsageColor(used, weekBudget)}${Math.floor(used)}%${RESET}`);
  const formatTokenText = (n: number) => `${selectColor(n, Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TOKENS_YELLOW_AT")), Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TOKENS_ORANGE_AT")), Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TOKENS_RED_AT")))}${formatTokens(n)}${RESET}`;
  const barColor = selectColor(
    pct,
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_CONTEXT_YELLOW_AT")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_CONTEXT_ORANGE_AT")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_CONTEXT_RED_AT")),
  );
  const branchName = getGitBranch(projectDir);

  // const model = `${CYAN}[${input.model?.display_name ?? "?"}]${RESET}`;
  // const model = `${CYAN}[${input.model?.display_name ?? "?"}]${RESET}(${formatOrDash(input.effort?.level, (level) => EFFORT_ABBREVIATION[level])})`;
  // const model = `${CYAN}[${input.model?.display_name ?? "?"}:${formatOrDash(input.effort?.level, (level) => EFFORT_ABBREVIATION[level])}]${RESET}`;
  const model = `${CYAN}[${formatShortModelName(input.model?.display_name)}:${formatOrDash(input.effort?.level, (level) => EFFORT_ABBREVIATION[level])}]${RESET}`;
  // const model = `${CYAN}[${formatModelName(input.model!.id)}:${formatOrDash(input.effort?.level, (level) => EFFORT_ABBREVIATION[level])}]${RESET}`;
  const folder = `📁 ${(input.workspace?.current_dir ?? "").split("/").pop()}`;
  const branch = branchName ? `🌿 ${branchName}` : "";
  const turnsColor = selectColor(
    turnCount,
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TURNS_YELLOW_AT")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TURNS_ORANGE_AT")),
    Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_TURNS_RED_AT")),
  );
  const turns = `🔄 ${turnsColor}${turnCount} turns${RESET}`;
  const contextBar = `${barColor}${formatBar(pct)}${RESET} ${barColor}${pct}%${RESET}`;
  const weekUsage = `Week:${spentOfWeek} (${formatOrDash(weekBudget, (budget) => `${selectBudgetColor(sevenDay, budget)}${Math.round(budget)}%${RESET}`)})`;
  const dayYellowAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_DAY_YELLOW_AT"));
  const dayOrangeAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_DAY_ORANGE_AT"));
  const dayRedAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_DAY_RED_AT"));
  const dayCount =
    `Day:${formatOrDash(weekDay, (day) => `${selectColor(day, dayYellowAt, dayOrangeAt, dayRedAt)}${day}${RESET}`)}/${GREEN}7${RESET}` +
    nextDaySuffix +
    (weekDay === undefined ? "" : formatWeeklyResetSuffix(weekDay, weeklySecondsLeft));
  const tokensInfo = `Tokens In:${formatOrDash(tokensIn, formatTokenText)} Out:${formatOrDash(tokensOut, formatTokenText)}`;
  const cacheSecondsLeft = computeSecondsUntilReset(input.prompt_cache?.expires_at ?? undefined, now);
  const cacheWarm = input.prompt_cache?.warm === true && cacheSecondsLeft > 0;
  const cacheTimer = cacheWarm
    ? `Prompt cache [resets in: ${GREEN}${formatCountdown(cacheSecondsLeft)}${RESET}]`
    : `Prompt cache [${RED}Expired${RESET}]`;
  const fiveHourYellowAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_FIVE_HOUR_YELLOW_AT"));
  const fiveHourOrangeAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_FIVE_HOUR_ORANGE_AT"));
  const fiveHourRedAt = Number(readEnvValue("CLAUDE_HOOKS_STATUS_LINE_FIVE_HOUR_RED_AT"));
  const fiveHrUsage =
    `5hr:${formatOrDash(fiveHour, (used) => `${selectColor(used, fiveHourYellowAt, fiveHourOrangeAt, fiveHourRedAt)}${Math.floor(used)}%${RESET}`)} ` +
    `(Resets in: ${formatOrDash(untilReset, (s) => `${resetColor(Math.floor(s / 60), fiveHour ?? 0)}${formatCountdown(s)}${RESET}`)})`;

  console.log(joinLine(model, folder, branch));
  // console.log(joinLine(turns, contextBar, weekUsage, dayCount));
  // console.log(joinLine(tokensInfo, fiveHrUsage));
  console.log(joinLine(contextBar, turns, tokensInfo));
  console.log(joinLine(fiveHrUsage, weekUsage, dayCount));
  console.log(joinLine(cacheTimer));
}
