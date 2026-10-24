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

test('test_history_is_not_empty_and_every_version_has_an_integer_id', validateHistoryHasIntegerIds)
