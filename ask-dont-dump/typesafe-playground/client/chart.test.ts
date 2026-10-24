import { test, expect } from 'bun:test'
import { renderChart } from './chart'

function validateModuleLoadsWithoutDom() {
  expect(typeof renderChart).toBe('function')
}

test('test_chart_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
