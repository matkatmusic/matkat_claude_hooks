import { test, expect } from 'bun:test'
import { loadVersions, openLoadPicker, resetVersionRuns, saveVersions } from './versionActions'

function validateModuleLoadsWithoutDom() {
  expect(typeof saveVersions).toBe('function')
  expect(typeof openLoadPicker).toBe('function')
  expect(typeof loadVersions).toBe('function')
  expect(typeof resetVersionRuns).toBe('function')
}

test('test_version_actions_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
