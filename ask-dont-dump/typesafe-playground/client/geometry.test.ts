import { test, expect } from 'bun:test'
import {
  BAR_W, BOTTOM, computeAverageBar, computeAverageLabelPoint, computeBarOffset, computeCallBar, computeCallLabelPoint, computeHitBar,
  computePlotHeight, computeRangeLine, computeSlotLeft, computeSlotWidth, computeY, LEFT, MIN_PLOT_H, OPTION_GAP, TOP,
} from './geometry'

function validateComputeY() {
  expect(computeY(1, 100)).toBe(TOP)
  expect(computeY(0, 100)).toBe(TOP + 100)
}

function validatePlotHeightHasAFloor() {
  expect(computePlotHeight(0)).toBe(MIN_PLOT_H)
  expect(computePlotHeight(TOP + BOTTOM + 200)).toBe(200)
}

function validateSlotWidth() {
  expect(computeSlotWidth(1, false)).toBe(16 + OPTION_GAP)
  expect(computeSlotWidth(4, false)).toBe(4 * BAR_W + OPTION_GAP)
  expect(computeSlotWidth(4, true)).toBe(5 * BAR_W + OPTION_GAP)
  expect(computeSlotLeft(2, 30)).toBe(LEFT + 60 + OPTION_GAP / 2)
  expect(computeBarOffset(true)).toBe(BAR_W)
  expect(computeBarOffset(false)).toBe(0)
}

function validateBars() {
  const callBar = computeCallBar(100, BAR_W, 2, 0.5, 100, 2)
  expect(callBar).toEqual({ x: 100 + BAR_W + 2 * BAR_W - 2, y: TOP + 50, width: BAR_W - 1 + 4, height: 50 })
  const averageBar = computeAverageBar(100, 0.25, 100, 0)
  expect(averageBar).toEqual({ x: 100, y: TOP + 75, width: BAR_W - 1, height: 25 })
  const rangeLine = computeRangeLine(100, { low: 0.2, high: 0.6, average: 0.4 }, 100)
  expect(rangeLine).toEqual({ x: 100 + (BAR_W - 1) / 2, y1: TOP + 40, y2: TOP + 80 })
}

function validateHitBarsAndLabels() {
  const values = [0.2, 0.6]
  expect(computeHitBar(100, BAR_W, -1, values, 100)).toEqual({ x: 100, y: TOP + 60, width: BAR_W - 1, height: 40 })
  expect(computeHitBar(100, BAR_W, 1, values, 100)).toEqual({ x: 100 + BAR_W + BAR_W, y: TOP + 40, width: BAR_W - 1, height: 60 })
  expect(computeAverageLabelPoint(100, 0.5, 100)).toEqual({ x: 107, y: TOP + 50 - 3 })
  expect(computeCallLabelPoint(100, BAR_W, 1, 0.5, 100)).toEqual({ x: 100 + BAR_W + BAR_W + 7, y: TOP + 50 - 3 })
}

test('test_compute_y_maps_value_to_height', validateComputeY)
test('test_plot_height_keeps_a_minimum', validatePlotHeightHasAFloor)
test('test_slot_width_and_offsets', validateSlotWidth)
test('test_bar_geometry', validateBars)
test('test_hit_bars_and_label_points', validateHitBarsAndLabels)
