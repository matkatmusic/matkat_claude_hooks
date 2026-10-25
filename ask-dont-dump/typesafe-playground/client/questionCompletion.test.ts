import { test, expect } from 'bun:test'
import { EditorState } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { buildNameOptions, listEditorNames, mergeNames } from './questionCompletion'

function validateMergeKeepsEachNameOnce() {
  expect(mergeNames(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c'])
}

function validateOptionsInsertNameThenBacktick() {
  const options = buildNameOptions(['mood'])
  expect(options[0].label).toBe('mood')
  expect(options[0].apply).toBe('mood`')
}

function validateListsNamesFromEditorState() {
  const state = EditorState.create({ doc: '{"a": {"b": 1}}', extensions: [json()] })
  expect(listEditorNames(state)).toEqual(['a', 'b'])
}

test('test_merge_names_keeps_each_name_once', validateMergeKeepsEachNameOnce)
test('test_options_insert_name_then_backtick', validateOptionsInsertNameThenBacktick)
test('test_list_editor_names_reads_syntax_tree', validateListsNamesFromEditorState)
