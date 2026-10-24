import { test, expect } from 'bun:test'
import { getEditors, pageState } from './state'

function validateStartingState() {
  expect(pageState.versions).toEqual([])
  expect(pageState.pinnedId).toBe(null)
  expect(pageState.wasEdited).toBe(false)
  expect(pageState.editors).toBe(null)
}

function validateGetEditorsThrowsBeforeCreation() {
  expect(getEditors).toThrow()
}

test('test_page_state_starts_empty', validateStartingState)
test('test_get_editors_throws_before_the_editors_exist', validateGetEditorsThrowsBeforeCreation)
