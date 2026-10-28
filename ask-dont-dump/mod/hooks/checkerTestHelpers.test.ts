import { test, expect } from 'claude-code/testing'
import { findKeywordIndex } from './checkerTestHelpers'

test('test_find_keyword_index_returns_the_matching_check_position', () => {
  expect(findKeywordIndex('Is a bug report that is not on this task list written in this message?')).toBe(2)
  expect(findKeywordIndex('nothing here')).toBe(-1)
})
