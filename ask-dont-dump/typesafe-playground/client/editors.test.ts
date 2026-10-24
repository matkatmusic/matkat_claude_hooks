import { test, expect } from 'bun:test'
import { createEditors, EDITOR_THEME_RULES, loadEditors, replaceEditorText } from './editors'

function validateModuleLoadsWithoutDom() {
  expect(EDITOR_THEME_RULES['&'].height).toBe('26vh')
  expect(typeof createEditors).toBe('function')
  expect(typeof loadEditors).toBe('function')
  expect(typeof replaceEditorText).toBe('function')
}

test('test_editors_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
