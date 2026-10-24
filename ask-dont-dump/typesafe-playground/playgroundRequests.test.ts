// @ts-ignore bun:test has no types in this tsconfig
import { test, expect } from 'bun:test'

const environment = (globalThis as any).process.env
environment.TYPESAFE_API_KEY ??= 'test-only'

function makePostRequest(body: unknown) {
  return new Request('http://localhost/test', { method: 'POST', body: JSON.stringify(body) })
}

async function validateRunRejectsStateThatIsNotAnObject() {
  const { executeRunRequest } = await import('./playgroundRequests')
  const response = await executeRunRequest(makePostRequest({ id: 1, state: 'text', questions: {}, calls: 1 }))
  expect(response.status).toBe(400)
}

async function validateRunRejectsZeroCalls() {
  const { executeRunRequest } = await import('./playgroundRequests')
  const response = await executeRunRequest(makePostRequest({ id: 1, state: {}, questions: {}, calls: 0 }))
  expect(response.status).toBe(400)
}

async function validateNoteRejectsUnknownId() {
  const { executeNoteRequest } = await import('./playgroundRequests')
  const response = await executeNoteRequest(makePostRequest({ id: 999999, note: 'text' }))
  expect(response.status).toBe(400)
}

test('test_run_rejects_state_that_is_not_an_object', validateRunRejectsStateThatIsNotAnObject)
test('test_run_rejects_zero_calls', validateRunRejectsZeroCalls)
test('test_note_rejects_an_id_that_does_not_exist', validateNoteRejectsUnknownId)
