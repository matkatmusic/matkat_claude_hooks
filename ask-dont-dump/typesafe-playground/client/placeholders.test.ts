import { test, expect } from 'bun:test'
import { snippet } from '@codemirror/autocomplete'
import { json } from '@codemirror/lang-json'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { Transaction } from '@codemirror/state'
import { findPlaceholderRanges } from './placeholders'
import { buildInsertPlan } from './questionSnippets'

function buildChoiceInsertText(): string {
  const state = EditorState.create({ doc: '{}', extensions: [json()] })
  const plan = buildInsertPlan(syntaxTree(state), '{}', 'choice')
  let result = '';
  function saveTransaction(transaction: Transaction): void {
    result = transaction.state.doc.toString();
  }
  snippet(plan.template)({ state: state, dispatch: saveTransaction }, null, plan.from, plan.to)
  return result
}

function listRangeTexts(text: string): string[] {
  const ranges = findPlaceholderRanges(text)
  const texts: string[] = []
  for (let i = 0; i < ranges.length; i++)
    texts.push(text.slice(ranges[i].from + 1, ranges[i].to - 1))
  return texts
}

function validatePlaceholdersSurviveTypingOverOne() {
  const text = buildChoiceInsertText()
  const before = listRangeTexts(text)
  expect(before).toEqual([
    'new_choice_1',
    'Which option best fits the state?',
    'option_a',
    'Description of an option',
    'option_b',
    'Another description of a distinct option',
    'option_c',
    'Another mutually exclusive option',
  ])
  const ranges = findPlaceholderRanges(text)
  expect(ranges.length).toBe(8)
  const typed = text.slice(0, ranges[3].from + 1) + 'real text' + text.slice(ranges[3].to - 1)
  const after = listRangeTexts(typed)
  expect(after.length).toBe(7)
  expect(after.includes('Description of an option')).toBe(false)
  expect(after.includes('option_a')).toBe(true)
  expect(after.includes('new_choice_1')).toBe(true)
}

test('test_placeholders_stay_found_after_typing_over_one', validatePlaceholdersSurviveTypingOverOne)
