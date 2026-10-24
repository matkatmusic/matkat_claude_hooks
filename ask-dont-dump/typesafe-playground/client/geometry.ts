import type { BarGeometry, LabelPoint, RangeLineGeometry, Summary } from './types';
import { computeSummary } from './values';

export const BAR_W = 8;
export const OPTION_GAP = 14;
export const LEFT = 44;
export const TOP = 30;
export const BOTTOM = 14;
export const MIN_PLOT_H = 40;
export const TICK_COUNT = 5;
export const MIN_SLOT_BARS_WIDTH = 16;
export const LABEL_LIFT = 3;
export const LABEL_SHIFT = 7;
export const PINNED_PAD = 2;

export function computeY(value: number, plotH: number): number {
  return TOP + plotH * (1 - value);
}

export function computePlotHeight(boxHeight: number): number {
  return Math.max(boxHeight - TOP - BOTTOM, MIN_PLOT_H);
}

export function computeSlotWidth(barCount: number, isAverageShown: boolean): number {
  const slotBars = barCount + (isAverageShown ? 1 : 0);
  return Math.max(slotBars * BAR_W, MIN_SLOT_BARS_WIDTH) + OPTION_GAP;
}

export function computeBarOffset(isAverageShown: boolean): number {
  return isAverageShown ? BAR_W : 0;
}

export function computeCallBar(slotX: number, offset: number, callIndex: number, value: number, plotH: number, pad: number): BarGeometry {
  return {
    x: slotX + offset + callIndex * BAR_W - pad,
    y: computeY(value, plotH),
    width: BAR_W - 1 + 2 * pad,
    height: plotH * value,
  };
}

export function computeAverageBar(slotX: number, average: number, plotH: number, pad: number): BarGeometry {
  return {
    x: slotX - pad,
    y: computeY(average, plotH),
    width: BAR_W - 1 + 2 * pad,
    height: plotH * average,
  };
}

export function computeRangeLine(slotX: number, stat: Summary, plotH: number): RangeLineGeometry {
  return {
    x: slotX + (BAR_W - 1) / 2,
    y1: computeY(stat.high, plotH),
    y2: computeY(stat.low, plotH),
  };
}

export function computeSlotLeft(columnIndex: number, slot: number): number {
  return LEFT + columnIndex * slot + OPTION_GAP / 2;
}

export function computeHitBar(slotX: number, offset: number, callIndex: number, values: number[], plotH: number): BarGeometry {
  const hitValue = callIndex < 0 ? computeSummary(values).average : values[callIndex];
  const hitX = callIndex < 0 ? slotX : slotX + offset + callIndex * BAR_W;
  return { x: hitX, y: computeY(hitValue, plotH), width: BAR_W - 1, height: plotH * hitValue };
}

export function computeAverageLabelPoint(slotX: number, average: number, plotH: number): LabelPoint {
  return { x: slotX + LABEL_SHIFT, y: computeY(average, plotH) - LABEL_LIFT };
}

export function computeCallLabelPoint(slotX: number, offset: number, callIndex: number, value: number, plotH: number): LabelPoint {
  return { x: slotX + offset + callIndex * BAR_W + LABEL_SHIFT, y: computeY(value, plotH) - LABEL_LIFT };
}
