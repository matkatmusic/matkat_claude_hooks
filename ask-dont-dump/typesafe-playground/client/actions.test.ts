import { test, expect } from 'bun:test'
import {
  clearPinned, executeRun, moveBy, moveToNext, moveToPrevious, resetHistory, saveNote, sendJson, setPinnedToShown,
} from './actions'

function validateModuleLoadsWithoutDom() {
  expect(typeof sendJson).toBe('function')
  expect(typeof moveBy).toBe('function')
  expect(typeof moveToPrevious).toBe('function')
  expect(typeof moveToNext).toBe('function')
  expect(typeof setPinnedToShown).toBe('function')
  expect(typeof clearPinned).toBe('function')
  expect(typeof executeRun).toBe('function')
  expect(typeof resetHistory).toBe('function')
  expect(typeof saveNote).toBe('function')
}

test('test_actions_module_loads_without_touching_the_dom', validateModuleLoadsWithoutDom)
