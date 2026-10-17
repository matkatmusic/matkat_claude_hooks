// import { readEnvValue } from "../shared/env.ts";
import { ANNOYANCE_ANCHORS } from "./status_line_config.ts";

// Six steps of "how much will a forced break sting": hue falls, saturation rises
export const ANNOYANCE_COLORS = [
  "\x1b[38;5;35m",
  "\x1b[38;5;106m",
  "\x1b[38;5;184m",
  "\x1b[38;5;214m",
  "\x1b[38;5;202m",
  "\x1b[38;5;196m",
];

function computeAnnoyanceThresholds(minutes: number): number[] {
  const longestWaitMinutes = ANNOYANCE_ANCHORS[ANNOYANCE_ANCHORS.length - 1][0];
  const clamped = Math.min(Math.max(minutes, 0), longestWaitMinutes);
  // const upper = ANNOYANCE_ANCHORS.findIndex(([at]) => at >= clamped);
  let upper = -1;
  for (let i = 0; i < ANNOYANCE_ANCHORS.length; i++) {
    const anchorReachesClamped = ANNOYANCE_ANCHORS[i][0] >= clamped;
    if (anchorReachesClamped) {
      upper = i;
      break;
    }
  }
  if (upper <= 0)
    return ANNOYANCE_ANCHORS[0][1];
  const [lowerAt, lower] = ANNOYANCE_ANCHORS[upper - 1];
  const [upperAt, higher] = ANNOYANCE_ANCHORS[upper];
  const between = (clamped - lowerAt) / (upperAt - lowerAt);
  const blended: number[] = [];
  for (let i = 0; i < lower.length; i++)
    blended.push(lower[i] + between * (higher[i] - lower[i]));
  return blended;
}

export function computeAnnoyanceLevel(usedPercent: number, minutes: number): number {
  let level = 1;
  for (const floor of computeAnnoyanceThresholds(minutes)) {
    const passedFloor = usedPercent >= floor - 1e-9;
    if (passedFloor)
      level++;
  }
  return level;
}

export function resetColor(minutes: number, usedPercent: number): string {
  return ANNOYANCE_COLORS[computeAnnoyanceLevel(usedPercent, minutes) - 1];
}
