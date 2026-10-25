// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

async function validateHistoryHasIntegerIds() {
  const { loadHistory } = await import('./playgroundHistory')
  const history = await loadHistory()
  expect(history.length).toBeGreaterThan(0)
  for (const version of history)
    expect(Number.isInteger(version.id)).toBe(true)
}

async function validateBlankVersionShape() {
  const { buildBlankVersion } = await import('./playgroundHistory')
  const blank = buildBlankVersion()
  expect(blank.id).toBe(1)
  expect(blank.state).toEqual({})
  expect(blank.questions).toEqual({})
  expect(blank.calls).toBe(0)
  expect(blank.outputs).toEqual([])
}

test('test_blank_version_has_empty_state_questions_and_outputs', validateBlankVersionShape)
test('test_history_is_not_empty_and_every_version_has_an_integer_id', validateHistoryHasIntegerIds)
