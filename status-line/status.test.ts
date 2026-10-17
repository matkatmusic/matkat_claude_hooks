#!/usr/bin/env node
import { strict as assert } from "node:assert";

// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RED_POINTS_LEFT = "2";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_ORANGE_POINTS_LEFT = "5";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_YELLOW_POINTS_LEFT = "8";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_SHOW_HOURS = "12";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_YELLOW_MINUTES = "180";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_ORANGE_MINUTES = "360";
// process.env.CLAUDE_HOOKS_STATUS_LINE_WEEKLY_RESET_RED_MINUTES = "540";
// process.env.CLAUDE_HOOKS_STATUS_LINE_ANNOYANCE_ANCHORS = "[[0,[95,99,102,102,102]],[20,[85,95,98,102,102]],[45,[70,74,78,82,90]],[80,[66,72,78,82,90]],[150,[58,64,70,74,82]]]";
const { ANNOYANCE_COLORS, DASH, computeAnnoyanceLevel, formatBar, selectBudgetColor, formatCountdown, countTurns, computeDayOfWeek, formatTokens, formatOrDash, selectColor, resetColor, computeSecondsUntilNextDay, computeSecondsUntilReset, getSessionTokens, computeWeeklyBudget, formatWeeklyResetSuffix, selectWeeklyUsageColor } = await import("./status.ts");

const GREEN = "\x1b[32m", YELLOW = "\x1b[33m", ORANGE = "\x1b[38;5;208m", RED = "\x1b[31m";

// Boundaries land on the higher-alarm color
assert.equal(selectColor(14, 15, 20, 25), GREEN);
assert.equal(selectColor(15, 15, 20, 25), YELLOW);
assert.equal(selectColor(20, 15, 20, 25), ORANGE);
assert.equal(selectColor(25, 15, 20, 25), RED);

// Sting of a forced break: rises with usage, and rises as the wait before the reset grows
assert.equal(computeAnnoyanceLevel(40, 80), 1, "plenty of room left");
assert.equal(computeAnnoyanceLevel(68, 80), 2);
assert.equal(computeAnnoyanceLevel(75, 45), 3);
assert.equal(computeAnnoyanceLevel(80, 45), 4);
assert.equal(computeAnnoyanceLevel(75, 150), 5);
assert.equal(computeAnnoyanceLevel(91, 45), 6, "nearly out with a long wait");
assert.equal(computeAnnoyanceLevel(99, 5), 3, "pinned at the limit but rescue is seconds away");
assert.equal(computeAnnoyanceLevel(99, 20), 4);
assert.equal(resetColor(80, 40), ANNOYANCE_COLORS[0]);
assert.equal(resetColor(45, 91), ANNOYANCE_COLORS[5]);

// The surface must never calm down as usage climbs or as the wait grows
for (let used = 0; used <= 100; used += 2) {
  for (let mins = 0; mins <= 300; mins += 5) {
    assert.ok(computeAnnoyanceLevel(used + 2, mins) >= computeAnnoyanceLevel(used, mins), `usage ${used} @ ${mins}m`);
    assert.ok(computeAnnoyanceLevel(used, mins + 5) >= computeAnnoyanceLevel(used, mins), `wait ${mins} @ ${used}%`);
  }
}

assert.equal(formatTokens(999), "999");
assert.equal(formatTokens(75000), "75.0K");
assert.equal(formatTokens(1234567), "1.2M");

assert.equal(formatBar(0), "░░░░░░░░░░");
assert.equal(formatBar(42), "████░░░░░░");
assert.equal(formatBar(150), "██████████", "over 100% must not blow up");

assert.equal(formatCountdown(5400), "01:30");
assert.equal(formatCountdown(59), "00:00");

assert.equal(computeSecondsUntilReset(2000, 1000), 1000, "epoch seconds");
assert.equal(computeSecondsUntilReset("2026-08-05T12:00:00Z", 1785931200 - 60), 60, "ISO 8601");
assert.equal(computeSecondsUntilReset(undefined, 1000), 0, "missing reset time");

assert.equal(computeDayOfWeek(6.5 * 86400), 1, "window just opened");
assert.equal(computeDayOfWeek(5.2 * 86400), 2);
assert.equal(computeDayOfWeek(3600), 7, "last day");
assert.equal(computeDayOfWeek(0), 7, "missing weekly reset time");
assert.equal(computeDayOfWeek(99 * 86400), 1, "nonsense future reset stays in range");

const almostDay4 = 4 * 86400 + 90;
assert.equal(computeDayOfWeek(almostDay4), 3);
assert.equal(computeSecondsUntilNextDay(almostDay4), 90, "counts down to the day 4 tick");
assert.equal(computeDayOfWeek(almostDay4 - computeSecondsUntilNextDay(almostDay4) - 1), 4, "and the tick happens at zero");

assert.equal(selectColor(4, 5, 6, 7), GREEN, "day 4 of the week");
assert.equal(selectColor(5, 5, 6, 7), YELLOW);
assert.equal(selectColor(6, 5, 6, 7), ORANGE);
assert.equal(selectColor(7, 5, 6, 7), RED, "last day of the week");

assert.equal(formatWeeklyResetSuffix(6, 3600), "", "only shows on day 7");
assert.equal(formatWeeklyResetSuffix(7, 0), "", "missing weekly reset time");
assert.equal(formatWeeklyResetSuffix(7, 13 * 3600), "", "more than 12 hours out");
assert.equal(formatWeeklyResetSuffix(7, 11 * 3600), ` (Resets in: ${RED}11:00\x1b[0m)`, "far from reset");
assert.equal(formatWeeklyResetSuffix(7, 7 * 3600), ` (Resets in: ${ORANGE}07:00\x1b[0m)`);
assert.equal(formatWeeklyResetSuffix(7, 4 * 3600), ` (Resets in: ${YELLOW}04:00\x1b[0m)`);
assert.equal(formatWeeklyResetSuffix(7, 1800), ` (Resets in: ${GREEN}00:30\x1b[0m)`, "nearly reset");

assert.equal(Math.round(computeWeeklyBudget(1)), 14, "day 1 allowance");
assert.equal(Math.round(computeWeeklyBudget(3)), 43);
assert.equal(computeWeeklyBudget(7), 100, "day 7 allows the whole week");

// Color follows the points left before the budget: 8+ green, 5-7 yellow, 2-4 orange, under 2 red
const day3 = computeWeeklyBudget(3);
assert.equal(selectWeeklyUsageColor(26, day3), GREEN, "17 points of room on day 3");
assert.equal(selectWeeklyUsageColor(day3 - 8, day3), GREEN);
assert.equal(selectWeeklyUsageColor(day3 - 7.9, day3), YELLOW);
assert.equal(selectWeeklyUsageColor(day3 - 5, day3), YELLOW);
assert.equal(selectWeeklyUsageColor(day3 - 4.9, day3), ORANGE);
assert.equal(selectWeeklyUsageColor(day3 - 2, day3), ORANGE);
assert.equal(selectWeeklyUsageColor(day3 - 1.9, day3), RED);
assert.equal(selectWeeklyUsageColor(day3, day3), RED, "exactly at budget");
assert.equal(selectWeeklyUsageColor(50, day3), RED, "over the day 3 allowance");
assert.equal(selectWeeklyUsageColor(50, computeWeeklyBudget(6)), GREEN, "same 50% is fine on day 6");

// The budget itself only turns red once the week's use reaches or passes it
assert.equal(selectBudgetColor(day3 - 1, day3), "", "under budget stays grey");
assert.equal(selectBudgetColor(day3, day3), RED, "exactly at budget");
assert.equal(selectBudgetColor(day3 + 10, day3), RED, "over budget");
assert.equal(selectBudgetColor(undefined, day3), "", "missing usage stays grey");

assert.equal(formatOrDash(undefined, () => "x"), DASH, "missing data shows a grey dash");
assert.equal(formatOrDash(0, (n) => `saw ${n}`), "saw 0", "zero is data, not a dash");
assert.equal(formatOrDash(42, (n) => `saw ${n}`), "saw 42");

assert.equal(countTurns([]), 0, "no sittings");
assert.equal(countTurns([{ turns: 3 }, { turns: 4 }]), 7, "sums turns across sittings");
assert.equal(countTurns([{}, { turns: 2 }]), 2, "missing turns counts as zero");

assert.equal(getSessionTokens([]), undefined, "no sittings, no session total");
assert.deepEqual(getSessionTokens([{ tokensIn: 100, tokensOut: 10 }, { tokensIn: 250, tokensOut: 40 }]), { in: 250, out: 40 }, "only the latest sitting's resync counts");
assert.deepEqual(getSessionTokens([{}]), { in: 0, out: 0 }, "a sitting with no token fields yet reads as zero, not missing");

console.log("ok — status line cases passed");
