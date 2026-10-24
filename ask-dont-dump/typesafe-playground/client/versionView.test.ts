import { test, expect } from 'bun:test'
import type { InfoPart, Version } from './types'
import {
  computeInputTokens, createEditedVersion, INPUT_COST_PER_MILLION, isTextEdited, listCostLineParts, listPinLineParts, listVersionLineParts,
} from './versionView'

const version: Version = {
  id: 2,
  time: 'now',
  state: { a: 1 },
  questions: { q: { type: 'noul' } },
  calls: 1,
  outputs: [{ model: 'm', answers: { q: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: 100, output_tokens: 5 } }],
  note: 'kept',
}

function listTexts(parts: InfoPart[]): string[] {
  const texts: string[] = []
  for (const part of parts)
    texts.push(part[0])
  return texts
}

function validateEditDetection() {
  const stateText = JSON.stringify(version.state, null, 2)
  const questionsText = JSON.stringify(version.questions, null, 2)
  expect(isTextEdited(stateText, questionsText, version)).toBe(false)
  expect(isTextEdited(stateText + ' ', questionsText, version)).toBe(true)
  expect(isTextEdited(stateText, questionsText + ' ', version)).toBe(true)
}

function validateEditedVersionHasNoRun() {
  const edited = createEditedVersion(version, 5)
  expect(edited.id).toBe(6)
  expect(edited.outputs).toEqual([])
  expect(edited.calls).toBe(0)
  expect(edited.note).toBe('')
  expect(edited.state).toEqual(version.state)
}

function validateInputTokensAndCost() {
  expect(computeInputTokens(version.outputs)).toBe(100)
  expect(computeInputTokens([])).toBe(0)
  const texts = listTexts(listCostLineParts(1000000))
  expect(texts[1]).toBe('$' + INPUT_COST_PER_MILLION.toFixed(6))
  expect(texts[3]).toBe('1000000')
}

function validateVersionLineParts() {
  const single = listTexts(listVersionLineParts(2, 3, 'now', 1))
  const several = listTexts(listVersionLineParts(2, 3, 'now', 4))
  expect(single[1]).toBe('2')
  expect(single[3]).toBe('3')
  expect(single[5]).toBe('now')
  expect(single[7]).toBe('1')
  expect(single[8]).not.toBe(several[8])
}

function validatePinLineParts() {
  expect(listPinLineParts(null).length).toBe(1)
  const pinned = listPinLineParts(7)
  expect(pinned.length).toBe(2)
  expect(pinned[1][0]).toBe('7')
}

test('test_edit_detection_compares_both_editors', validateEditDetection)
test('test_edited_version_has_no_run', validateEditedVersionHasNoRun)
test('test_input_tokens_and_cost', validateInputTokensAndCost)
test('test_version_line_parts', validateVersionLineParts)
test('test_pin_line_parts', validatePinLineParts)
