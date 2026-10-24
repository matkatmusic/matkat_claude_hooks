import { test, expect } from 'bun:test'
import { renderOption, renderValueLabels } from './chartOption'

function validateModuleLoadsWithoutDom() {
  expect(typeof renderOption).toBe('function')
  expect(typeof renderValueLabels).toBe('function')
}

test('test_chart_option_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
