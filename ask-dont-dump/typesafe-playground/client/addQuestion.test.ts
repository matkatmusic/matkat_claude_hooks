import { test, expect } from 'bun:test'
import { snippet } from '@codemirror/autocomplete'
import { json } from '@codemirror/lang-json'
import { syntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import type { Transaction } from '@codemirror/state'
import { findClosingBracePosition } from './addQuestion'
import { buildInsertPlan } from './questionSnippets'
import type { QuestionType } from './questionSnippets'

function runInsert(doc: string, type: QuestionType): string {
  const state = EditorState.create({ doc: doc, extensions: [json()] })
  const plan = buildInsertPlan(syntaxTree(state), doc, type)
  let result = '';
  function saveTransaction(transaction: Transaction): void {
    result = transaction.state.doc.toString();
  }
  snippet(plan.template)({ state: state, dispatch: saveTransaction }, null, plan.from, plan.to)
  return result
}

function validateClosingBracePosition() {
  const state = EditorState.create({ doc: '{\n  "a": 1\n}', extensions: [json()] })
  expect(findClosingBracePosition(state)).toBe(11)
  expect(findClosingBracePosition(EditorState.create({ doc: '', extensions: [json()] }))).toBe(null)
}

function validateInsertAfterLastQuestionIsValidJson() {
  const doc = JSON.stringify({ q: { type: 'noul', instructions: 'x', criteria: { true: 'a', false: 'b' } } }, null, 2)
  const types: QuestionType[] = ['noul', 'score', 'choice']
  for (let i = 0; i < types.length; i++) {
    const parsed = JSON.parse(runInsert(doc, types[i]))
    expect(Object.keys(parsed)).toEqual(['q', 'new_' + types[i] + '_1'])
    expect(parsed['new_' + types[i] + '_1'].type).toBe(types[i])
  }
}

function validateInsertIntoEmptyObjectIsValidJson() {
  const text = runInsert('{}', 'choice')
  expect(text.startsWith('{\n  "new_choice_1": {\n    "type": "choice",')).toBe(true)
  expect(text.endsWith('\n  }\n}')).toBe(true)
  expect(Object.keys(JSON.parse(text))).toEqual(['new_choice_1'])
}

test('test_closing_brace_position_comes_from_the_syntax_tree', validateClosingBracePosition)
test('test_insert_after_last_question_gives_valid_json', validateInsertAfterLastQuestionIsValidJson)
test('test_insert_into_empty_object_gives_valid_json', validateInsertIntoEmptyObjectIsValidJson)
