import { test, expect } from 'bun:test'
import { jsonLanguage } from '@codemirror/lang-json'
import { buildInsertPlan, buildQuestionLines, findNextFreeName } from './questionSnippets'

function validateNextFreeNameIsLowestUnused() {
  expect(findNextFreeName('noul', [])).toBe('new_noul_1')
  expect(findNextFreeName('noul', ['new_noul_1', 'new_noul_3'])).toBe('new_noul_2')
  expect(findNextFreeName('choice', ['new_noul_1'])).toBe('new_choice_1')
}

function validateSnippetTextPerType() {
  const noul = buildQuestionLines('noul', 'new_noul_1').join('\n')
  expect(noul).toContain('"type": "noul"')
  expect(noul).toContain('"true": "${3:description}"')
  expect(noul).toContain('"false": "${4:description}"')
  const score = buildQuestionLines('score', 'new_score_2').join('\n')
  expect(score).toContain('"${1:new_score_2}": {')
  expect(score).toContain('"${5:score 2 description}"')
  const choice = buildQuestionLines('choice', 'new_choice_1').join('\n')
  expect(choice).toContain('"${3:option_a}": "${4:Description of an option}"')
  expect(choice).toContain('"${7:option_c}": "${8:Another mutually exclusive option}"')
}

function validatePlanAfterLastQuestionAddsComma() {
  const text = '{\n  "q": {\n    "type": "noul"\n  }\n}'
  const plan = buildInsertPlan(jsonLanguage.parser.parse(text), text, 'score')
  expect(plan.from).toBe(text.indexOf('}\n}') + 1)
  expect(plan.to).toBe(plan.from)
  expect(plan.template.startsWith(',\n"${1:new_score_1}": {\n  "type": "score",')).toBe(true)
}

function validatePlanForEmptyObjectFillsBetweenBraces() {
  const text = '{}'
  const plan = buildInsertPlan(jsonLanguage.parser.parse(text), text, 'noul')
  expect(plan.from).toBe(1)
  expect(plan.to).toBe(1)
  expect(plan.template.startsWith('\n  "${1:new_noul_1}": {\n    "type": "noul",')).toBe(true)
  expect(plan.template.endsWith('\n  }\n')).toBe(true)
}

function validatePlanSkipsUsedNames() {
  const text = '{"new_choice_1": 1}'
  const plan = buildInsertPlan(jsonLanguage.parser.parse(text), text, 'choice')
  expect(plan.template).toContain('${1:new_choice_2}')
}

test('test_next_free_name_is_lowest_unused', validateNextFreeNameIsLowestUnused)
test('test_snippet_text_per_type', validateSnippetTextPerType)
test('test_plan_after_last_question_adds_comma', validatePlanAfterLastQuestionAddsComma)
test('test_plan_for_empty_object_fills_between_braces', validatePlanForEmptyObjectFillsBetweenBraces)
test('test_plan_skips_used_names', validatePlanSkipsUsedNames)
