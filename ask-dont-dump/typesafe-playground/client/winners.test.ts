import { test, expect } from 'bun:test'
import type { ChoiceResponse } from '@typesafe-ai/sdk'
import { formatWinnerLine, listWinnerGroups } from './winners'

const first: ChoiceResponse = { type: 'choice', choice: 'a', confidence: 1, probabilities: { a: 0.9, b: 0.1 } }
const second: ChoiceResponse = { type: 'choice', choice: 'b', confidence: 1, probabilities: { a: 0.1, b: 0.9 } }

function validateGroupsRunsByWinner() {
  const groups = listWinnerGroups([first, second, first])
  expect(groups.length).toBe(2)
  expect(groups[0]).toEqual({ key: 'a', runs: [1, 3] })
  expect(groups[1]).toEqual({ key: 'b', runs: [2] })
}

function validateFormatWinnerLine() {
  const line = formatWinnerLine({ type: 'choice', criteria: { a: 'first' } }, { key: 'a', runs: [1, 3] })
  expect(line).toBe('first (1,3)')
}

test('test_winner_groups_collect_run_numbers', validateGroupsRunsByWinner)
test('test_winner_line_holds_description_and_runs', validateFormatWinnerLine)
