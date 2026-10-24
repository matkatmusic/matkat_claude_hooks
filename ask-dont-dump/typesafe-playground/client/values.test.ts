import { test, expect } from 'bun:test'
import type { ChoiceResponse, NoulResponse, Question, ScoreResponse } from '@typesafe-ai/sdk'
import type { Version } from './types'
import {
  computeSummary, formatValueText, listAnswers, listOptionKeys, listValues, readConfidence, readDescription, readTopKey, readValue,
} from './values'

const choiceAnswer: ChoiceResponse = { type: 'choice', choice: 'a', confidence: 0.9, probabilities: { a: 0.7, b: 0.3 } }
const noulAnswer: NoulResponse = { type: 'noul', noul: 0.8 }
const scoreAnswer: ScoreResponse = { type: 'score', score: 1.4, confidence: 0.5, legend: { 0: 'low', 1: 'high' }, probabilities: { 0: 0.2, 1: 0.8 } }

function validateFormatValueText() {
  expect(formatValueText(undefined)).toBe('(none)')
  expect(formatValueText(null)).toBe('(none)')
  expect(formatValueText('text')).toBe('text')
  expect(formatValueText({ a: 1 })).toBe('{"a":1}')
}

function validateListOptionKeys() {
  expect(listOptionKeys(noulAnswer)).toEqual(['yes', 'no'])
  expect(listOptionKeys(choiceAnswer)).toEqual(['a', 'b'])
}

function validateReadValue() {
  expect(readValue(noulAnswer, 'yes')).toBe(0.8)
  expect(readValue(noulAnswer, 'no')).toBeCloseTo(0.2)
  expect(readValue(choiceAnswer, 'b')).toBe(0.3)
  expect(readValue(scoreAnswer, '1')).toBe(0.8)
}

function validateReadConfidence() {
  function readNoulConfidence() {
    return readConfidence(noulAnswer)
  }
  expect(readConfidence(choiceAnswer)).toBe(0.9)
  expect(readNoulConfidence).toThrow()
}

function validateReadTopKey() {
  expect(readTopKey(choiceAnswer, ['a', 'b'])).toBe('a')
  expect(readTopKey(noulAnswer, ['yes', 'no'])).toBe('yes')
  expect(readTopKey(scoreAnswer, ['0', '1'])).toBe('1')
}

function validateReadDescription() {
  const noulQuestion: Question = { type: 'noul', criteria: { true: 'is yes', false: 'is no' } }
  const noulBare: Question = { type: 'noul' }
  const choiceQuestion: Question = { type: 'choice', criteria: { a: 'first', b: null } }
  const scoreQuestion: Question = { type: 'score', criteria: ['low', 'high'] }
  expect(readDescription(noulQuestion, 'yes')).toBe('is yes')
  expect(readDescription(noulQuestion, 'no')).toBe('is no')
  expect(readDescription(noulBare, 'yes')).toBe('(none)')
  expect(readDescription(choiceQuestion, 'a')).toBe('first')
  expect(readDescription(choiceQuestion, 'b')).toBe('(none)')
  expect(readDescription(scoreQuestion, '1')).toBe('high')
}

function validateComputeSummary() {
  const summary = computeSummary([0.2, 0.8, 0.5])
  expect(summary.low).toBe(0.2)
  expect(summary.high).toBe(0.8)
  expect(summary.average).toBeCloseTo(0.5)
}

function validateListValuesAndAnswers() {
  const version: Version = {
    id: 1,
    time: 'now',
    state: null,
    questions: {},
    calls: 2,
    outputs: [
      { model: 'm', answers: { q: choiceAnswer }, usage: { input_tokens: 1, output_tokens: 1 } },
      { model: 'm', answers: { q: choiceAnswer }, usage: { input_tokens: 1, output_tokens: 1 } },
    ],
  }
  const answers = listAnswers(version, 'q')
  expect(answers.length).toBe(2)
  expect(listValues(answers, 'a')).toEqual([0.7, 0.7])
}

test('test_format_value_text_handles_missing_text_and_json', validateFormatValueText)
test('test_list_option_keys_for_each_answer_type', validateListOptionKeys)
test('test_read_value_for_each_answer_type', validateReadValue)
test('test_read_confidence_throws_for_noul', validateReadConfidence)
test('test_read_top_key_for_each_answer_type', validateReadTopKey)
test('test_read_description_for_each_question_type', validateReadDescription)
test('test_compute_summary_finds_low_high_average', validateComputeSummary)
test('test_list_values_and_answers_follow_the_outputs', validateListValuesAndAnswers)
