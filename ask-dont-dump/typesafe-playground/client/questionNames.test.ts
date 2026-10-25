import { test, expect } from 'bun:test'
import { jsonLanguage } from '@codemirror/lang-json'
import { collectPropertyNames, findTopLevelObject, listTopLevelKeys } from './questionNames'

function validateCollectsDistinctNamesAtAnyDepth() {
  const text = '{"a": {"b": 1, "a": 2}, "c": [{"d": 1}]}'
  const tree = jsonLanguage.parser.parse(text)
  expect(collectPropertyNames(tree, text)).toEqual(['a', 'b', 'c', 'd'])
}

function validateCollectsNamesFromBrokenJson() {
  const text = '{"a": 1, "b": '
  const tree = jsonLanguage.parser.parse(text)
  expect(collectPropertyNames(tree, text)).toEqual(['a', 'b'])
}

function validateListsOnlyTopLevelKeys() {
  const text = '{"a": {"b": 1}, "c": 2}'
  const tree = jsonLanguage.parser.parse(text)
  const object = findTopLevelObject(tree)
  if (object === null)
    throw new Error('no object')
  expect(listTopLevelKeys(object, text)).toEqual(['a', 'c'])
}

function validateEmptyTextHasNoObject() {
  expect(findTopLevelObject(jsonLanguage.parser.parse(''))).toBe(null)
}

test('test_collect_names_reads_every_depth_once', validateCollectsDistinctNamesAtAnyDepth)
test('test_collect_names_works_on_broken_json', validateCollectsNamesFromBrokenJson)
test('test_list_top_level_keys_skips_nested_names', validateListsOnlyTopLevelKeys)
test('test_empty_text_has_no_top_level_object', validateEmptyTextHasNoObject)
