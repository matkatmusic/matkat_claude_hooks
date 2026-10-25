// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

function makePostRequest(body: unknown) {
  return new Request('http://localhost/test', { method: 'POST', body: JSON.stringify(body) })
}

async function validateLoadRejectsEmptyArray() {
  const { executeLoadRequest } = await import('./playgroundVersionRequests')
  const response = await executeLoadRequest(makePostRequest({ versions: [] }))
  expect(response.status).toBe(400)
}

async function validateLoadRejectsItemWithoutOutputsArray() {
  const { executeLoadRequest } = await import('./playgroundVersionRequests')
  const item = { id: 1, state: {}, questions: {}, calls: 0, outputs: 'text' }
  const response = await executeLoadRequest(makePostRequest({ versions: [item] }))
  expect(response.status).toBe(400)
}

async function validateResetRunsRejectsUnknownId() {
  const { executeResetRunsRequest } = await import('./playgroundVersionRequests')
  const response = await executeResetRunsRequest(makePostRequest({ id: 999999 }))
  expect(response.status).toBe(400)
}

test('test_load_rejects_an_empty_array', validateLoadRejectsEmptyArray)
test('test_load_rejects_an_item_without_an_outputs_array', validateLoadRejectsItemWithoutOutputsArray)
test('test_reset_runs_rejects_an_id_that_does_not_exist', validateResetRunsRejectsUnknownId)
