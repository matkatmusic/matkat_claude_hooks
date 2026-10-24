import { test, expect } from 'bun:test'
import { addInfoRow, addPart, addParts, createBarInfoBox, createWinnerLines } from './infoDom'

function validateModuleLoadsWithoutDom() {
  expect(typeof addPart).toBe('function')
  expect(typeof addParts).toBe('function')
  expect(typeof addInfoRow).toBe('function')
  expect(typeof createBarInfoBox).toBe('function')
  expect(typeof createWinnerLines).toBe('function')
}

test('test_info_dom_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
