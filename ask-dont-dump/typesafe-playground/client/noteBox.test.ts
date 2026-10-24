import { test, expect } from 'bun:test'
import { computeNotePlaceholder, computeNoteValue } from './noteBox'

function validateNoteValue() {
  expect(computeNoteValue(true, 'kept')).toBe('kept')
  expect(computeNoteValue(true, undefined)).toBe('')
  expect(computeNoteValue(false, 'kept')).toBe('')
}

function validateNotePlaceholder() {
  expect(computeNotePlaceholder(true)).not.toBe(computeNotePlaceholder(false))
}

test('test_note_value_is_empty_until_a_run_exists', validateNoteValue)
test('test_note_placeholder_depends_on_the_run', validateNotePlaceholder)
