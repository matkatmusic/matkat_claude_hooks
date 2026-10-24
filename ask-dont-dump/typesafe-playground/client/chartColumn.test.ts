import { test, expect } from 'bun:test'
import { renderColumn } from './chartColumn'

function validateModuleLoadsWithoutDom() {
  expect(typeof renderColumn).toBe('function')
}

test('test_chart_column_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
