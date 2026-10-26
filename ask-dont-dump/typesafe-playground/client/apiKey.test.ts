import { test, expect } from 'bun:test'
import { isKeyMissing, MISSING_KEY_MESSAGE, readTypedKey, setKeyToVisible, updateSubmitAvailability } from './apiKey'

function validateKeyIsMissingOnlyWithoutBothKeys() {
  expect(isKeyMissing(false, '')).toBe(true)
  expect(isKeyMissing(false, '   ')).toBe(true)
  expect(isKeyMissing(false, 'abc')).toBe(false)
  expect(isKeyMissing(true, '')).toBe(false)
  expect(isKeyMissing(true, 'abc')).toBe(false)
}

function validateModuleLoadsWithoutDom() {
  expect(MISSING_KEY_MESSAGE).toBe('Add a TypeSafe API key to submit runs')
  expect(typeof readTypedKey).toBe('function')
  expect(typeof updateSubmitAvailability).toBe('function')
  expect(typeof setKeyToVisible).toBe('function')
}

test('test_key_is_missing_only_without_both_keys', validateKeyIsMissingOnlyWithoutBothKeys)
test('test_api_key_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
