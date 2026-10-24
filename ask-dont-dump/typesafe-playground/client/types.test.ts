import { test, expect } from 'bun:test'
import type { PageData, RequestBody, RunBody } from './types'

function validatePageDataSurvivesJson() {
  const data: PageData = {
    versions: [{ id: 1, time: 'now', state: { a: [1, 2] }, questions: { q: { type: 'noul' } }, calls: 0, outputs: [] }],
  }
  const copy: PageData = JSON.parse(JSON.stringify(data))
  expect(copy).toEqual(data)
}

function validateRequestBodyAcceptsEachShape() {
  const runBody: RunBody = { id: 1, state: null, questions: {}, calls: 2 }
  const bodies: RequestBody[] = [runBody, { id: 1, note: 'text' }, {}]
  expect(bodies.length).toBe(3)
}

test('test_page_data_survives_a_json_round_trip', validatePageDataSurvivesJson)
test('test_request_body_accepts_run_note_and_reset', validateRequestBodyAcceptsEachShape)
