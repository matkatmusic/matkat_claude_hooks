import { test, expect } from 'bun:test'
import type { Version } from './types'
import { findPinned, readPinnedData } from './pinned'

const usage = { input_tokens: 1, output_tokens: 1 }
const answeredVersion: Version = {
  id: 2,
  time: 'now',
  state: null,
  questions: { q: { type: 'noul' } },
  calls: 1,
  outputs: [{ model: 'm', answers: { q: { type: 'noul', noul: 0.4 } }, usage: usage }],
}
const emptyVersion: Version = { ...answeredVersion, id: 3, calls: 0, outputs: [] }

function validateFindPinned() {
  const versions: Version[] = [answeredVersion, emptyVersion]
  expect(findPinned(versions, 3)).toBe(emptyVersion)
  expect(findPinned(versions, null)).toBe(null)
  expect(findPinned(versions, 9)).toBe(null)
}

function validateReadPinnedData() {
  expect(readPinnedData(null, 'q')).toBe(null)
  expect(readPinnedData(emptyVersion, 'q')).toBe(null)
  expect(readPinnedData(answeredVersion, 'other')).toBe(null)
  const pinned = readPinnedData(answeredVersion, 'q')
  expect(pinned?.keys).toEqual(['yes', 'no'])
  expect(pinned?.answers.length).toBe(1)
}

test('test_find_pinned_matches_by_id', validateFindPinned)
test('test_read_pinned_data_needs_a_question_and_answers', validateReadPinnedData)
