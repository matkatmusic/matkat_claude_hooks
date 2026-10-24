import { test, expect } from 'bun:test'
import { attachHover, HIT_STROKE_COLOR, removeValueLabels, updateShownInfo } from './chartHover'

function validateModuleLoadsWithoutDom() {
  expect(HIT_STROKE_COLOR).toBe('hotpink')
  expect(typeof updateShownInfo).toBe('function')
  expect(typeof removeValueLabels).toBe('function')
  expect(typeof attachHover).toBe('function')
}

test('test_chart_hover_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
