import { test, expect } from 'bun:test'
import type { ChoiceResponse, NoulResponse, Question } from '@typesafe-ai/sdk'
import type { BarInfoRequest, InfoRow } from './types'
import { buildBarInfoRows } from './barInfo'

const question: Question = { type: 'choice', criteria: { a: 'first', b: 'second' } }
const answers: ChoiceResponse[] = [
  { type: 'choice', choice: 'a', confidence: 0.5, probabilities: { a: 0.6, b: 0.4 } },
  { type: 'choice', choice: 'b', confidence: 0.7, probabilities: { a: 0.2, b: 0.8 } },
]

function validateEmptyRowsHaveNoValues() {
  const request: BarInfoRequest = { question, answers, key: '', keys: ['a', 'b'], pinnedValues: null, callIndex: null, pinnedId: null }
  const rows: InfoRow[] = buildBarInfoRows(request)
  expect(rows.length).toBe(4)
  expect(rows[0].parts[0][0]).toBe('')
}

function validateCallRowsHoldTheCallValues() {
  const request: BarInfoRequest = { question, answers, key: 'a', keys: ['a', 'b'], pinnedValues: [0.1, 0.3], callIndex: 1, pinnedId: 4 }
  const rows: InfoRow[] = buildBarInfoRows(request)
  expect(rows.length).toBe(6)
  expect(rows[1].parts[0][0]).toBe('0.200')
  expect(rows[1].parts[2][0]).toBe('0.700')
  expect(rows[3].parts[0][0]).toBe('1')
}

function validateAverageRowsHoldTheAverages() {
  const request: BarInfoRequest = { question, answers, key: 'a', keys: ['a', 'b'], pinnedValues: null, callIndex: -1, pinnedId: null }
  const rows = buildBarInfoRows(request)
  expect(rows[1].parts[0][0]).toBe('0.400')
  expect(rows[1].parts[2][0]).toBe('0.600')
}

function validateNoulCallThrowsForMissingConfidence() {
  const noulAnswers: NoulResponse[] = [{ type: 'noul', noul: 0.5 }]
  const request: BarInfoRequest = { question: { type: 'noul' }, answers: noulAnswers, key: 'yes', keys: ['yes', 'no'], pinnedValues: null, callIndex: 0, pinnedId: null }
  function buildNoulRows() {
    return buildBarInfoRows(request)
  }
  expect(buildNoulRows).toThrow()
}

test('test_empty_bar_info_has_blank_values', validateEmptyRowsHaveNoValues)
test('test_call_bar_info_holds_score_and_confidence', validateCallRowsHoldTheCallValues)
test('test_average_bar_info_holds_averages', validateAverageRowsHoldTheAverages)
test('test_noul_call_bar_info_throws', validateNoulCallThrowsForMissingConfidence)
