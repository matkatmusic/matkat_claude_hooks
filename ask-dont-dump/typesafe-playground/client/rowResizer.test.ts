import { test, expect } from 'bun:test'
import { attachResizer, computeDraggedSize, computeMinimumSize, MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT } from './rowResizer'

function validateMinimumSizeFollowsDirection() {
  expect(computeMinimumSize('rows')).toBe(MIN_ROW_HEIGHT)
  expect(computeMinimumSize('columns')).toBe(MIN_COLUMN_WIDTH)
}

function validateRowDragMovesAndClamps() {
  expect(computeDraggedSize(200, 50, 600, 8, MIN_ROW_HEIGHT)).toBe(250)
  expect(computeDraggedSize(200, -500, 600, 8, MIN_ROW_HEIGHT)).toBe(80)
  expect(computeDraggedSize(200, 900, 600, 8, MIN_ROW_HEIGHT)).toBe(512)
}

function validateColumnDragMovesAndClamps() {
  expect(computeDraggedSize(400, -100, 1000, 12, MIN_COLUMN_WIDTH)).toBe(300)
  expect(computeDraggedSize(400, -500, 1000, 12, MIN_COLUMN_WIDTH)).toBe(240)
  expect(computeDraggedSize(400, 900, 1000, 12, MIN_COLUMN_WIDTH)).toBe(748)
}

function validateTinyContainerKeepsMinimum() {
  expect(computeDraggedSize(100, 10, 100, 8, MIN_ROW_HEIGHT)).toBe(80)
}

function validateModuleLoadsWithoutDom() {
  expect(typeof attachResizer).toBe('function')
}

test('test_minimum_size_follows_the_direction', validateMinimumSizeFollowsDirection)
test('test_row_drag_moves_and_clamps_to_80px', validateRowDragMovesAndClamps)
test('test_column_drag_moves_and_clamps_to_240px', validateColumnDragMovesAndClamps)
test('test_tiny_container_keeps_the_minimum_size', validateTinyContainerKeepsMinimum)
test('test_row_resizer_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
